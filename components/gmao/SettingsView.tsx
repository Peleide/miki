import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, ListChecks, MapPin, Users, Coins, ArrowUp, ArrowDown, RotateCcw, KeyRound } from 'lucide-react';
import { ChecklistItemType, GmaoChecklist, GmaoSite, ROLE_LABEL } from '../../functions/src/gmao/model';
import { useGmao } from './GmaoContext';
import { Badge, Button, Card, Empty, Field, fmtXpf, Input, Label, Modal, PageHeader, Segmented, Select, Textarea } from './ui';
import { db } from '../../services/db';
import { UserRole } from '../../types';
import { getDemoEngine } from '../../services/gmao/demoBackend';

// ─── Check-lists ─────────────────────────────────────────────────────────────

const ITEM_TYPES: { value: ChecklistItemType; label: string }[] = [
  { value: 'BOOLEAN', label: 'Conforme / non conforme' },
  { value: 'NUMBER', label: 'Valeur numérique' },
  { value: 'TEXT', label: 'Texte libre' },
  { value: 'PHOTO', label: 'Photo' },
];

const ChecklistModal: React.FC<{ edit?: GmaoChecklist; onClose: () => void }> = ({ edit, onClose }) => {
  const { run } = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [kind, setKind] = useState<'MAINTENANCE' | 'SECURITE'>(edit?.kind || 'MAINTENANCE');
  const [description, setDescription] = useState(edit?.description || '');
  const [items, setItems] = useState(edit?.items.map(i => ({ ...i })) || [{ id: '', label: '', type: 'BOOLEAN' as ChecklistItemType, required: true }]);
  const [saving, setSaving] = useState(false);
  const upd = (i: number, k: string, v: any) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; setItems(c); };
  const submit = async () => {
    setSaving(true);
    const res = await run('CHECKLIST_SAVE', { id: edit?.id, name, kind, description, items }, 'Check-list enregistrée.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal wide title={edit ? 'Modifier la check-list' : 'Nouvelle check-list'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!name.trim() || !items.some(i => i.label.trim())}>Enregistrer</Button>
    </>}>
      <Field label="Nom" required><Input value={name} onChange={e => setName(e.target.value)} placeholder="Contrôle mensuel chargeuse" /></Field>
      <Field label="Usage">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'MAINTENANCE', label: 'Maintenance (clôture des BT)' }, { value: 'SECURITE', label: 'Sécurité (avant démarrage)' }]} />
      </Field>
      <Field label="Description"><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <div className="space-y-2">
        <Label>Points de contrôle</Label>
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} className="text-gray-300 hover:text-dark" aria-label="Monter"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} className="text-gray-300 hover:text-dark" aria-label="Descendre"><ArrowDown size={14} /></button>
            </div>
            <Input className="flex-1 min-w-[200px]" value={it.label} onChange={e => upd(i, 'label', e.target.value)} placeholder={`Point ${i + 1}`} />
            <div className="w-52"><Select value={it.type} onChange={e => upd(i, 'type', e.target.value)}>{ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
            <label className="flex items-center gap-1 text-xs font-bold text-gray-500"><input type="checkbox" checked={it.required} onChange={e => upd(i, 'required', e.target.checked)} className="accent-[#EE6E0A]" />Obligatoire</label>
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-danger p-1" aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        ))}
        <Button small variant="secondary" icon={<Plus size={14} />} onClick={() => setItems([...items, { id: '', label: '', type: 'BOOLEAN', required: true }])}>Ajouter un point</Button>
      </div>
    </Modal>
  );
};

// ─── Sites ───────────────────────────────────────────────────────────────────

const SiteModal: React.FC<{ edit?: GmaoSite; onClose: () => void }> = ({ edit, onClose }) => {
  const { run } = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [address, setAddress] = useState(edit?.address || '');
  const submit = async () => { const r = await run('SITE_SAVE', { id: edit?.id, name, address, status: edit?.status }, 'Site enregistré.'); if (r) onClose(); };
  return (
    <Modal title={edit ? 'Modifier le site' : 'Nouveau site'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!name.trim()}>Enregistrer</Button></>}>
      <Field label="Nom" required><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ducos, Gadji…" /></Field>
      <Field label="Adresse"><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
    </Modal>
  );
};

// ─── Comptes (mode Firebase uniquement) ──────────────────────────────────────

const ROLE_TO_MIKI: Record<string, UserRole> = { RESPONSABLE: UserRole.TECHNICIAN, TECHNICIEN: UserRole.AGENT, DEMANDEUR: UserRole.CLIENT };

const UserModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const { backend, toast } = useGmao();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', role: 'TECHNICIEN' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const submit = async () => {
    setSaving(true);
    try {
      const res: any = await db.createUser(backend.tenantId, f.firstName.trim(), f.lastName.trim(), f.email.trim(), ROLE_TO_MIKI[f.role]);
      setCreated({ email: f.email.trim(), password: res?.password || '' });
      onCreated();
    } catch (e: any) {
      toast(e?.message || 'Création impossible.');
    } finally {
      setSaving(false);
    }
  };
  if (created) {
    return (
      <Modal title="Compte créé" onClose={onClose} footer={<Button onClick={onClose}>Terminé</Button>}>
        <p className="text-sm">Transmettez ces identifiants à la personne. Le mot de passe devra être changé à la première connexion.</p>
        <div className="rounded-2xl bg-gray-50 p-4 font-mono text-sm"><div>{created.email}</div><div className="text-lg font-black tracking-widest mt-1">{created.password}</div></div>
      </Modal>
    );
  }
  return (
    <Modal title="Nouveau compte" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={saving} disabled={!f.email.includes('@') || !f.firstName.trim()}>Créer</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" required><Input value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Nom"><Input value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} /></Field>
      </div>
      <Field label="E-mail" required><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Profil">
        <Segmented value={f.role} onChange={v => setF({ ...f, role: v })} options={[{ value: 'TECHNICIEN', label: 'Technicien' }, { value: 'DEMANDEUR', label: 'Demandeur / direction' }, { value: 'RESPONSABLE', label: 'Responsable' }]} />
      </Field>
    </Modal>
  );
};

const UsersCard: React.FC = () => {
  const { backend, users, toast, confirm } = useGmao();
  const [list, setList] = useState(users);
  const [creating, setCreating] = useState(false);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  useEffect(() => setList(users), [users]);
  const reload = () => backend.listUsers().then(setList);
  const reset = async (id: string, name: string) => {
    if (!await confirm({ title: 'Réinitialiser le mot de passe', message: `Un mot de passe provisoire va être généré pour ${name}.`, confirmLabel: 'Réinitialiser' })) return;
    try {
      const r: any = await db.managerResetPassword(id, { tenantId: backend.tenantId } as any);
      setResetResult({ name, password: r?.tempPassword || '' });
    } catch (e: any) { toast(e?.message || 'Échec.'); }
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Users size={16} className="text-primary" /><Label>Comptes</Label></div>
        {backend.mode === 'firebase' && <Button small icon={<Plus size={14} />} onClick={() => setCreating(true)}>Ajouter</Button>}
      </div>
      <div className="divide-y divide-border">
        {list.map(u => (
          <div key={u.id} className="py-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-dark">{u.name}</span>
            <span className="flex items-center gap-2">
              <Badge className={u.role === 'RESPONSABLE' ? 'bg-primary/10 text-primary' : u.role === 'TECHNICIEN' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}>{ROLE_LABEL[u.role]}</Badge>
              {backend.mode === 'firebase' && <button onClick={() => reset(u.id, u.name)} className="text-gray-300 hover:text-primary" title="Réinitialiser le mot de passe"><KeyRound size={14} /></button>}
            </span>
          </div>
        ))}
      </div>
      {backend.mode === 'demo' && <p className="text-[11px] text-gray-400 mt-2">Mode démo : comptes fictifs, changez de profil en haut de l'écran.</p>}
      {creating && <UserModal onClose={() => setCreating(false)} onCreated={reload} />}
      {resetResult && (
        <Modal title="Mot de passe provisoire" onClose={() => setResetResult(null)} footer={<Button onClick={() => setResetResult(null)}>Terminé</Button>}>
          <p className="text-sm">{resetResult.name} devra le changer à la prochaine connexion.</p>
          <div className="rounded-2xl bg-gray-50 p-4 font-mono text-lg font-black tracking-widest">{resetResult.password}</div>
        </Modal>
      )}
    </Card>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

export const SettingsView: React.FC = () => {
  const g = useGmao();
  const [chk, setChk] = useState<{ edit?: GmaoChecklist } | null>(null);
  const [site, setSite] = useState<{ edit?: GmaoSite } | null>(null);
  const [rate, setRate] = useState(String(g.settings.hourlyRate || ''));
  useEffect(() => setRate(String(g.settings.hourlyRate || '')), [g.settings.hourlyRate]);

  const archiveChk = async (c: GmaoChecklist) => {
    if (await g.confirm({ title: 'Archiver la check-list', message: `« ${c.name} » ne sera plus proposée.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('CHECKLIST_ARCHIVE', { id: c.id }, 'Check-list archivée.');
  };
  const resetDemo = async () => {
    if (await g.confirm({ title: 'Réinitialiser la démo', message: 'Toutes les saisies de démonstration seront remplacées par le jeu de données initial.', variant: 'warning', confirmLabel: 'Réinitialiser' })) {
      await getDemoEngine().reset();
      g.toast('Démo réinitialisée.', 'success');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Réglages" subtitle="Sites, check-lists, sécurité, coûts et comptes." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><MapPin size={16} className="text-primary" /><Label>Sites</Label></div>
            <Button small icon={<Plus size={14} />} onClick={() => setSite({})}>Ajouter</Button>
          </div>
          <div className="divide-y divide-border">
            {g.sites.map(s => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                <div><div className="text-sm font-bold text-dark">{s.name}</div>{s.address && <div className="text-xs text-gray-400">{s.address}</div>}</div>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{g.assets.filter(a => a.siteId === s.id && !a.isArchived && a.level === 'EQUIPEMENT').length} équip.</span>
                  <button onClick={() => setSite({ edit: s })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                </span>
              </div>
            ))}
            {!g.sites.length && <Empty>Aucun site.</Empty>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Coins size={16} className="text-primary" /><Label>Coût de la main d'œuvre interne</Label></div>
          <Field label="Taux horaire chargé (XPF / h)" hint="Sert à valoriser les heures saisies sur les bons de travail.">
            <div className="flex gap-2">
              <Input type="number" min={0} value={rate} onChange={e => setRate(e.target.value)} />
              <Button onClick={() => g.run('SETTINGS_SAVE', { hourlyRate: rate || 0 }, 'Taux enregistré.')}>Enregistrer</Button>
            </div>
          </Field>
          <p className="text-xs text-gray-400 mt-2">Actuel : {fmtXpf(g.settings.hourlyRate)} / h</p>

          <div className="flex items-center gap-2 mt-6 mb-3"><ShieldCheck size={16} className="text-primary" /><Label>Analyse de sécurité avant intervention</Label></div>
          <Field label="Check-list Take 5 / permis feu" hint="Proposée par défaut sur chaque nouveau BT ; bloque le démarrage si un point n'est pas validé.">
            <Select value={g.settings.safetyChecklistId || ''} onChange={e => g.run('SETTINGS_SAVE', { safetyChecklistId: e.target.value || null }, 'Réglage enregistré.')}>
              <option value="">Désactivée</option>
              {g.checklists.filter(c => c.kind === 'SECURITE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><ListChecks size={16} className="text-primary" /><Label>Check-lists</Label></div>
            <Button small icon={<Plus size={14} />} onClick={() => setChk({})}>Nouvelle check-list</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.checklists.map(c => (
              <div key={c.id} className="rounded-2xl border border-border p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-dark">{c.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.items.length} point(s) · {c.kind === 'SECURITE' ? 'Sécurité' : 'Maintenance'}{g.settings.safetyChecklistId === c.id ? ' · par défaut' : ''}</div>
                </div>
                <span className="flex gap-2">
                  <button onClick={() => setChk({ edit: c })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                  <button onClick={() => archiveChk(c)} className="text-gray-300 hover:text-danger" aria-label="Archiver"><Trash2 size={14} /></button>
                </span>
              </div>
            ))}
            {!g.checklists.length && <Empty>Aucune check-list.</Empty>}
          </div>
        </Card>

        <div className="lg:col-span-2"><UsersCard /></div>

        {g.backend.mode === 'demo' && (
          <Card className="p-5 lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <div><Label>Mode démonstration</Label><p className="text-sm text-gray-500 mt-1">Données fictives stockées dans ce navigateur uniquement.</p></div>
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={resetDemo}>Réinitialiser la démo</Button>
          </Card>
        )}
      </div>
      {chk && <ChecklistModal edit={chk.edit} onClose={() => setChk(null)} />}
      {site && <SiteModal edit={site.edit} onClose={() => setSite(null)} />}
    </div>
  );
};
