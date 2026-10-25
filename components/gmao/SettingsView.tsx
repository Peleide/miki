import React, { useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, ShieldCheck, ListChecks, MapPin, Users, ArrowUp, ArrowDown, RotateCcw, KeyRound, Tags, Building2,
  Settings2, Hash, Timer, Package, Power, X,
} from 'lucide-react';
import {
  ChecklistItemType, GmaoChecklist, GmaoClient, GmaoRole, GmaoSite, METER_LABEL, PLANS, PRIORITIES, PRIORITY_WORD, ROLE_LABEL, Typology,
  delayLabel,
} from '../../functions/src/gmao/model';
import { KITS } from '../../functions/src/gmao/kits';
import { useGmao } from './GmaoContext';
import { Badge, Button, Card, Empty, Field, Input, Label, Modal, PageHeader, Segmented, Select, Textarea, Toggle } from './ui';
import { Account } from '../../services/gmao/backend';
import { getDemoEngine } from '../../services/gmao/demoBackend';
import { PlanUsage } from './DashboardView';

const Section: React.FC<{ icon: any; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ icon: Icon, title, action, children, className = '' }) => (
  <Card className={`p-5 ${className}`}>
    <div className="flex items-center justify-between mb-3 gap-2">
      <div className="flex items-center gap-2"><Icon size={16} className="text-primary" /><Label>{title}</Label></div>
      {action}
    </div>
    {children}
  </Card>
);

// ─── Check-lists ─────────────────────────────────────────────────────────────

const ITEM_TYPES: { value: ChecklistItemType; label: string }[] = [
  { value: 'BOOLEAN', label: 'Conforme / non conforme' },
  { value: 'CHOICE', label: 'Choix (ex. OK / remplacé)' },
  { value: 'NUMBER', label: 'Valeur numérique' },
  { value: 'TEXT', label: 'Texte libre' },
  { value: 'PHOTO', label: 'Photo' },
];

const ChecklistModal: React.FC<{ edit?: GmaoChecklist; onClose: () => void }> = ({ edit, onClose }) => {
  const { run } = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [kind, setKind] = useState<'MAINTENANCE' | 'SECURITE'>(edit?.kind || 'MAINTENANCE');
  const [description, setDescription] = useState(edit?.description || '');
  const [items, setItems] = useState(edit?.items.map(i => ({ ...i, optionsText: (i.options || []).join(' ; ') })) || [{ id: '', label: '', type: 'BOOLEAN' as ChecklistItemType, required: true, optionsText: '' }]);
  const [saving, setSaving] = useState(false);
  const upd = (i: number, k: string, v: any) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; setItems(c); };
  const submit = async () => {
    setSaving(true);
    const res = await run('CHECKLIST_SAVE', { id: edit?.id, name, kind, description, items: items.map(({ optionsText, ...it }) => ({ ...it, options: it.type === 'CHOICE' ? optionsText : undefined })) }, 'Check-list enregistrée.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal wide title={edit ? 'Modifier la check-list' : 'Nouvelle check-list'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!name.trim() || !items.some(i => i.label.trim())}>Enregistrer</Button>
    </>}>
      <Field label="Nom" required><Input value={name} onChange={e => setName(e.target.value)} placeholder="Entretien autolaveuse" /></Field>
      <Field label="Usage">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'MAINTENANCE', label: 'Maintenance (fin d’intervention)' }, { value: 'SECURITE', label: 'Sécurité (avant de démarrer)' }]} />
      </Field>
      <Field label="Description"><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <div className="space-y-2">
        <Label>Points de contrôle</Label>
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl border border-border p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} className="text-gray-300 hover:text-dark" aria-label="Monter"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} className="text-gray-300 hover:text-dark" aria-label="Descendre"><ArrowDown size={14} /></button>
              </div>
              <Input className="flex-1 min-w-[200px]" value={it.label} onChange={e => upd(i, 'label', e.target.value)} placeholder={`Point ${i + 1}`} />
              <div className="w-56"><Select value={it.type} onChange={e => upd(i, 'type', e.target.value)}>{ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
              <label className="flex items-center gap-1 text-xs font-bold text-gray-500"><input type="checkbox" checked={it.required} onChange={e => upd(i, 'required', e.target.checked)} className="accent-[#EE6E0A]" />Obligatoire</label>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-danger p-1" aria-label="Supprimer"><Trash2 size={16} /></button>
            </div>
            {it.type === 'CHOICE' && <Input value={it.optionsText} onChange={e => upd(i, 'optionsText', e.target.value)} placeholder="Choix séparés par « ; » — le premier est la réponse « conforme ». Ex. : OK ; 1er remplacement ; 2e remplacement" />}
          </div>
        ))}
        <Button small variant="secondary" icon={<Plus size={14} />} onClick={() => setItems([...items, { id: '', label: '', type: 'BOOLEAN', required: true, optionsText: '' }])}>Ajouter un point</Button>
      </div>
    </Modal>
  );
};

// ─── Sites, typologies, clients ──────────────────────────────────────────────

const SiteModal: React.FC<{ edit?: GmaoSite; onClose: () => void }> = ({ edit, onClose }) => {
  const { run } = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [address, setAddress] = useState(edit?.address || '');
  const submit = async () => { const r = await run('SITE_SAVE', { id: edit?.id, name, address, status: edit?.status }, 'Site enregistré.'); if (r) onClose(); };
  return (
    <Modal title={edit ? 'Modifier le site' : 'Nouveau site'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!name.trim()}>Enregistrer</Button></>}>
      <Field label="Nom" required><Input value={name} onChange={e => setName(e.target.value)} placeholder="Dépôt, agence, site client…" /></Field>
      <Field label="Adresse"><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
    </Modal>
  );
};

const TypologyModal: React.FC<{ edit?: Typology; onClose: () => void }> = ({ edit, onClose }) => {
  const { run, checklists } = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [meterType, setMeterType] = useState(edit?.meterType || '');
  const [defaultChecklistId, setChk] = useState(edit?.defaultChecklistId || '');
  const submit = async () => { const r = await run('TYPOLOGY_SAVE', { id: edit?.id, name, meterType: meterType || null, defaultChecklistId: defaultChecklistId || null }, 'Typologie enregistrée.'); if (r) onClose(); };
  return (
    <Modal title={edit ? 'Modifier la typologie' : 'Nouvelle typologie'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!name.trim()}>Enregistrer</Button></>}>
      <Field label="Nom" required><Input value={name} onChange={e => setName(e.target.value)} placeholder="Autolaveuse, Véhicule léger, Centrale de dilution…" /></Field>
      <Field label="Compteur proposé" hint="Les véhicules ont un kilométrage, certains engins un horamètre.">
        <Select value={meterType} onChange={e => setMeterType(e.target.value)}><option value="">Aucun</option><option value="KM">{METER_LABEL.KM}</option><option value="HEURES">{METER_LABEL.HEURES}</option></Select>
      </Field>
      <Field label="Check-list par défaut" hint="Proposée quand on saisit une intervention sur une machine de cette typologie.">
        <Select value={defaultChecklistId} onChange={e => setChk(e.target.value)}><option value="">Aucune</option>{checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </Field>
    </Modal>
  );
};

const ClientModal: React.FC<{ edit?: GmaoClient; onClose: () => void }> = ({ edit, onClose }) => {
  const { run } = useGmao();
  const [f, setF] = useState({ name: edit?.name || '', contactName: edit?.contactName || '', email: edit?.email || '', phone: edit?.phone || '', address: edit?.address || '', notes: edit?.notes || '' });
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));
  const submit = async () => { const r = await run('CLIENT_SAVE', { id: edit?.id, ...f }, 'Client enregistré.'); if (r) onClose(); };
  return (
    <Modal title={edit ? 'Modifier le client' : 'Nouveau client'} subtitle="Organisation pour laquelle vous entretenez des machines (elle peut avoir plusieurs comptes)." onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!f.name.trim()}>Enregistrer</Button></>}>
      <Field label="Nom" required><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Clinique, hôtel, collectivité…" /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Contact"><Input value={f.contactName} onChange={e => set('contactName', e.target.value)} /></Field>
        <Field label="Téléphone"><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="E-mail"><Input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
      <Field label="Adresse"><Input value={f.address} onChange={e => set('address', e.target.value)} /></Field>
      <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
};

// ─── Comptes ─────────────────────────────────────────────────────────────────

const AccountModal: React.FC<{ onClose: () => void; onCreated: () => void; defaultClientId?: string }> = ({ onClose, onCreated, defaultClientId }) => {
  const g = useGmao();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', role: (defaultClientId ? 'CLIENT' : 'TECHNICIEN') as GmaoRole, clientId: defaultClientId || g.clients.find(c => !c.isArchived)?.id || '' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await g.backend.accounts.create({ firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), role: f.role, clientId: f.role === 'CLIENT' ? f.clientId : null });
      setCreated({ email: f.email.trim(), password: res.password });
      onCreated();
    } catch (e: any) {
      g.toast(e?.message || 'Création impossible.');
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
    <Modal title="Nouveau compte" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={saving} disabled={!f.email.includes('@') || !f.firstName.trim() || (f.role === 'CLIENT' && !f.clientId)}>Créer</Button></>}>
      <Field label="Profil">
        <Segmented value={f.role} onChange={v => setF({ ...f, role: v })} options={[{ value: 'TECHNICIEN', label: 'Technicien' }, { value: 'CLIENT', label: 'Client' }, { value: 'RESPONSABLE', label: 'Responsable' }]} />
      </Field>
      <p className="text-xs text-gray-500">{f.role === 'TECHNICIEN' ? 'Réalise les interventions de son parc, fait les relevés, voit son planning.' : f.role === 'CLIENT' ? 'Consulte l’historique et le suivi de ses machines, signale un problème ou laisse une remarque.' : 'Gère tout : parc, planning, préventif, comptes et réglages.'}</p>
      {f.role === 'CLIENT' && (
        <Field label="Organisation cliente" required>
          {g.clients.filter(c => !c.isArchived).length
            ? <Select value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value })}>{g.clients.filter(c => !c.isArchived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            : <p className="text-sm text-orange-600">Créez d’abord le client dans la rubrique Clients.</p>}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" required><Input value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Nom"><Input value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} /></Field>
      </div>
      <Field label="E-mail" required><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
    </Modal>
  );
};

const ROLE_BADGE: Record<GmaoRole, string> = { RESPONSABLE: 'bg-primary/10 text-primary', TECHNICIEN: 'bg-teal-50 text-teal-700', CLIENT: 'bg-blue-50 text-blue-600' };

const AccountsCard: React.FC = () => {
  const g = useGmao();
  const [list, setList] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);
  const reload = () => g.backend.accounts.list().then(setList).catch(() => setList([]));
  useEffect(() => { reload(); }, [g.backend]);
  const techs = list.filter(a => a.role === 'TECHNICIEN' && !a.isDisabled).length;
  const reset = async (a: Account) => {
    if (!await g.confirm({ title: 'Réinitialiser le mot de passe', message: `Un mot de passe provisoire va être généré pour ${a.name}.`, confirmLabel: 'Réinitialiser' })) return;
    try { const r = await g.backend.accounts.resetPassword(a.id); setResetResult({ name: a.name, password: r.password }); } catch (e: any) { g.toast(e?.message || 'Échec.'); }
  };
  const toggle = async (a: Account) => {
    if (!a.isDisabled && !await g.confirm({ title: 'Désactiver le compte', message: `${a.name} ne pourra plus se connecter. Son historique est conservé.`, variant: 'danger', confirmLabel: 'Désactiver' })) return;
    try { await g.backend.accounts.setDisabled(a.id, !a.isDisabled); g.toast(a.isDisabled ? 'Compte réactivé.' : 'Compte désactivé.', 'success'); reload(); } catch (e: any) { g.toast(e?.message || 'Échec.'); }
  };
  return (
    <Section icon={Users} title={`Comptes${g.plan ? ` · ${techs} / ${g.plan.maxTechnicians} technicien(s)` : ''}`} action={<Button small icon={<Plus size={14} />} onClick={() => setCreating(true)}>Ajouter</Button>}>
      <div className="divide-y divide-border">
        {list.map(a => (
          <div key={a.id} className={`py-2.5 flex flex-wrap items-center justify-between gap-2 ${a.isDisabled ? 'opacity-50' : ''}`}>
            <div className="min-w-0"><div className="text-sm font-bold text-dark">{a.name}</div><div className="text-[11px] text-gray-400">{a.email}{a.role === 'CLIENT' && a.clientId ? ` · ${g.clientName(a.clientId)}` : ''}</div></div>
            <span className="flex items-center gap-2">
              <Badge className={ROLE_BADGE[a.role]}>{ROLE_LABEL[a.role]}</Badge>
              {a.isDisabled && <Badge className="bg-gray-200 text-gray-500">Désactivé</Badge>}
              {g.backend.mode === 'firebase' && a.id !== g.me.id && <>
                <button onClick={() => reset(a)} className="text-gray-300 hover:text-primary" title="Réinitialiser le mot de passe" aria-label="Réinitialiser le mot de passe"><KeyRound size={14} /></button>
                <button onClick={() => toggle(a)} className="text-gray-300 hover:text-danger" title={a.isDisabled ? 'Réactiver' : 'Désactiver'} aria-label={a.isDisabled ? 'Réactiver' : 'Désactiver'}><Power size={14} /></button>
              </>}
            </span>
          </div>
        ))}
        {!list.length && <Empty>Aucun compte.</Empty>}
      </div>
      {g.backend.mode === 'demo' && <p className="text-[11px] text-gray-400 mt-2">Mode démo : comptes fictifs, changez de profil en haut de l'écran.</p>}
      {creating && <AccountModal onClose={() => setCreating(false)} onCreated={reload} />}
      {resetResult && (
        <Modal title="Mot de passe provisoire" onClose={() => setResetResult(null)} footer={<Button onClick={() => setResetResult(null)}>Terminé</Button>}>
          <p className="text-sm">{resetResult.name} devra le changer à la prochaine connexion.</p>
          <div className="rounded-2xl bg-gray-50 p-4 font-mono text-lg font-black tracking-widest">{resetResult.password}</div>
        </Modal>
      )}
    </Section>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

export const SettingsView: React.FC = () => {
  const g = useGmao();
  const s = g.settings;
  const [modal, setModal] = useState<null | { t: 'chk'; edit?: GmaoChecklist } | { t: 'site'; edit?: GmaoSite } | { t: 'typ'; edit?: Typology } | { t: 'client'; edit?: GmaoClient }>(null);
  const [prefix, setPrefix] = useState(s.assetCodePrefix);
  const [delays, setDelays] = useState<Record<string, string>>(Object.fromEntries(PRIORITIES.map(p => [p, String(s.priorityDelays[p])])));
  const [newType, setNewType] = useState('');
  useEffect(() => { setPrefix(s.assetCodePrefix); setDelays(Object.fromEntries(PRIORITIES.map(p => [p, String(s.priorityDelays[p])]))); }, [s.assetCodePrefix, JSON.stringify(s.priorityDelays)]);
  const save = (patch: any, msg = 'Réglage enregistré.') => g.run('SETTINGS_SAVE', patch, msg);

  const archiveChk = async (c: GmaoChecklist) => {
    if (await g.confirm({ title: 'Archiver la check-list', message: `« ${c.name} » ne sera plus proposée.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('CHECKLIST_ARCHIVE', { id: c.id }, 'Check-list archivée.');
  };
  const archiveTyp = async (t: Typology) => {
    if (await g.confirm({ title: 'Archiver la typologie', message: `« ${t.name} » ne sera plus proposée pour les nouvelles machines.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('TYPOLOGY_ARCHIVE', { id: t.id }, 'Typologie archivée.');
  };
  const archiveClient = async (c: GmaoClient) => {
    if (c.isArchived) { g.run('CLIENT_SAVE', { ...c, isArchived: false }, 'Client réactivé.'); return; }
    if (await g.confirm({ title: 'Archiver le client', message: `« ${c.name} » ne compte plus dans votre offre. Ses comptes ne verront plus rien si ses machines sont archivées.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('CLIENT_ARCHIVE', { id: c.id }, 'Client archivé.');
  };
  const applyKit = async (id: string, name: string) => {
    if (!await g.confirm({ title: `Appliquer le kit « ${name} »`, message: 'Les typologies, check-lists et gammes types manquantes seront ajoutées. Rien d’existant n’est modifié.', confirmLabel: 'Appliquer' })) return;
    const r = await g.run('KIT_APPLY', { kitId: id });
    if (r) g.toast(r.added ? `${r.added} élément(s) ajouté(s).` : 'Ce kit était déjà en place.', 'success');
  };
  const resetDemo = async () => {
    if (await g.confirm({ title: 'Réinitialiser la démo', message: 'Toutes les saisies de démonstration seront remplacées par le jeu de données initial.', variant: 'warning', confirmLabel: 'Réinitialiser' })) {
      await getDemoEngine().reset();
      g.toast('Démo réinitialisée.', 'success');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Réglages" subtitle={`${g.tenantName}${g.plan ? ` · offre ${PLANS[g.plan.tier].label}` : ''}`} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Section icon={Settings2} title="Fonctionnement">
          <div className="divide-y divide-border">
            <Toggle checked={s.requireApproval} onChange={v => save({ requireApproval: v })} label="Valider les signalements" hint="Activé : chaque signalement attend votre accord avant de devenir une intervention. Désactivé : l’intervention est créée tout de suite." />
            <Toggle checked={s.techniciansSelfPlan} onChange={v => save({ techniciansSelfPlan: v })} label="Les techniciens gèrent leur planning" hint="Ils planifient eux-mêmes leurs interventions et leurs tâches. Sinon, c’est vous qui attribuez." />
            <Toggle checked={s.publicReports} onChange={v => save({ publicReports: v })} label="Signalement public par QR code" hint="Toute personne qui scanne le QR code avec son téléphone peut signaler un problème, sans compte (nom obligatoire)." />
            <Toggle checked={s.assetHierarchy} onChange={v => save({ assetHierarchy: v })} label="Sous-ensembles et composants" hint="Décomposer une machine (moteur, circuit hydraulique…). Inutile pour la plupart des parcs." />
          </div>
          <div className="mt-3">
            <Field label="Analyse de sécurité avant intervention" hint="Check-list à valider avant de démarrer (ex. Take 5). Un « non » bloque l’intervention.">
              <Select value={s.safetyChecklistId || ''} onChange={e => save({ safetyChecklistId: e.target.value || null })}>
                <option value="">Désactivée</option>
                {g.checklists.filter(c => c.kind === 'SECURITE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
        </Section>

        <div className="space-y-4">
          <PlanUsage />
          <Section icon={Hash} title="Codes machine">
            <Segmented value={s.assetCodeMode} onChange={v => save({ assetCodeMode: v })} options={[{ value: 'GENERATED', label: 'Générés par Miki' }, { value: 'MANUAL', label: 'Codes de l’entreprise' }]} />
            {s.assetCodeMode === 'GENERATED' ? (
              <div className="flex items-end gap-2 mt-3">
                <Field label="Préfixe" hint={`Ex. ${prefix || 'MAC'}-0001, ${prefix || 'MAC'}-0002…`}><Input value={prefix} maxLength={6} onChange={e => setPrefix(e.target.value.toUpperCase())} /></Field>
                <Button onClick={() => save({ assetCodePrefix: prefix })} disabled={!prefix || prefix === s.assetCodePrefix}>Enregistrer</Button>
              </div>
            ) : <p className="text-xs text-gray-500 mt-3">Chaque machine reçoit le code que vous saisissez ou importez (CSV). Le QR code reste unique et non devinable.</p>}
          </Section>
        </div>

        <Section icon={Timer} title="Priorités et délais de traitement">
          <div className="grid grid-cols-2 gap-3">
            {PRIORITIES.map(p => (
              <Field key={p} label={PRIORITY_WORD[p]} hint={delayLabel(Number(delays[p]) || 0)}>
                <div className="flex items-center gap-2"><Input type="number" min={0} max={365} value={delays[p]} onChange={e => setDelays({ ...delays, [p]: e.target.value })} /><span className="text-xs text-gray-500">jours</span></div>
              </Field>
            ))}
          </div>
          <Button className="mt-3" small onClick={() => save({ priorityDelays: delays }, 'Délais enregistrés.')}>Enregistrer les délais</Button>
        </Section>

        <Section icon={Tags} title="Types d'intervention">
          <div className="flex flex-wrap gap-2">
            {s.interventionTypes.map(t => (
              <Badge key={t} className="bg-gray-100 text-dark normal-case tracking-normal text-xs">{t}
                {s.interventionTypes.length > 1 && <button onClick={() => save({ interventionTypes: s.interventionTypes.filter(x => x !== t) })} className="ml-1 text-gray-400 hover:text-danger" aria-label={`Retirer ${t}`}><X size={12} /></button>}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Input value={newType} onChange={e => setNewType(e.target.value)} placeholder="Ajouter un type" onKeyDown={e => { if (e.key === 'Enter' && newType.trim()) { save({ interventionTypes: [...s.interventionTypes, newType.trim()] }); setNewType(''); } }} />
            <Button small onClick={() => { save({ interventionTypes: [...s.interventionTypes, newType.trim()] }); setNewType(''); }} disabled={!newType.trim()}>Ajouter</Button>
          </div>
        </Section>

        <Section icon={Package} title="Typologies de machines" action={<Button small icon={<Plus size={14} />} onClick={() => setModal({ t: 'typ' })}>Ajouter</Button>}>
          <div className="divide-y divide-border">
            {g.typologies.filter(t => !t.isArchived).map(t => (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                <div><div className="text-sm font-bold text-dark">{t.name}</div><div className="text-xs text-gray-400">{t.meterType ? METER_LABEL[t.meterType] : 'Sans compteur'} · {g.assets.filter(a => a.typologyId === t.id && !a.isArchived).length} machine(s) · {g.pmPlans.filter(p => p.typologyId === t.id && !p.isArchived).length} gamme(s) type</div></div>
                <span className="flex gap-2">
                  <button onClick={() => setModal({ t: 'typ', edit: t })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                  <button onClick={() => archiveTyp(t)} className="text-gray-300 hover:text-danger" aria-label="Archiver"><Trash2 size={14} /></button>
                </span>
              </div>
            ))}
            {!g.typologies.some(t => !t.isArchived) && <Empty>Aucune typologie. Appliquez un kit de démarrage ci-dessous.</Empty>}
          </div>
        </Section>

        <Section icon={Building2} title={`Clients${g.plan ? ` · ${g.clients.filter(c => !c.isArchived).length} / ${g.plan.maxClients}` : ''}`} action={<Button small icon={<Plus size={14} />} onClick={() => setModal({ t: 'client' })}>Ajouter</Button>}>
          <div className="divide-y divide-border">
            {g.clients.map(c => (
              <div key={c.id} className={`py-2.5 flex items-center justify-between gap-2 ${c.isArchived ? 'opacity-50' : ''}`}>
                <div><div className="text-sm font-bold text-dark">{c.name}{c.isArchived ? ' (archivé)' : ''}</div><div className="text-xs text-gray-400">{[c.contactName, c.phone].filter(Boolean).join(' · ') || '—'} · {g.assets.filter(a => a.clientId === c.id && !a.isArchived && a.level === 'EQUIPEMENT').length} machine(s)</div></div>
                <span className="flex gap-2">
                  <button onClick={() => setModal({ t: 'client', edit: c })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                  <button onClick={() => archiveClient(c)} className="text-gray-300 hover:text-danger" aria-label={c.isArchived ? 'Réactiver' : 'Archiver'}>{c.isArchived ? <RotateCcw size={14} /> : <Trash2 size={14} />}</button>
                </span>
              </div>
            ))}
            {!g.clients.length && <Empty>Aucun client. Ajoutez les organisations pour lesquelles vous entretenez des machines : elles pourront suivre leurs maintenances.</Empty>}
          </div>
        </Section>

        <Section icon={MapPin} title="Sites" action={<Button small icon={<Plus size={14} />} onClick={() => setModal({ t: 'site' })}>Ajouter</Button>}>
          <div className="divide-y divide-border">
            {g.sites.map(site => (
              <div key={site.id} className="py-2.5 flex items-center justify-between gap-2">
                <div><div className="text-sm font-bold text-dark">{site.name}</div>{site.address && <div className="text-xs text-gray-400">{site.address}</div>}</div>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{g.assets.filter(a => a.siteId === site.id && !a.isArchived && a.level === 'EQUIPEMENT').length} machine(s)</span>
                  <button onClick={() => setModal({ t: 'site', edit: site })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                </span>
              </div>
            ))}
            {!g.sites.length && <Empty>Aucun site.</Empty>}
          </div>
        </Section>

        <Section icon={ListChecks} title="Check-lists" className="lg:col-span-2" action={<Button small icon={<Plus size={14} />} onClick={() => setModal({ t: 'chk' })}>Nouvelle check-list</Button>}>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.checklists.map(c => (
              <div key={c.id} className="rounded-2xl border border-border p-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-dark flex items-center gap-1">{c.kind === 'SECURITE' && <ShieldCheck size={14} className="text-primary" />}{c.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.items.length} point(s) · {c.kind === 'SECURITE' ? 'Sécurité' : 'Maintenance'}{s.safetyChecklistId === c.id ? ' · active' : ''}</div>
                </div>
                <span className="flex gap-2">
                  <button onClick={() => setModal({ t: 'chk', edit: c })} className="text-gray-300 hover:text-primary" aria-label="Modifier"><Pencil size={14} /></button>
                  <button onClick={() => archiveChk(c)} className="text-gray-300 hover:text-danger" aria-label="Archiver"><Trash2 size={14} /></button>
                </span>
              </div>
            ))}
            {!g.checklists.length && <Empty>Aucune check-list.</Empty>}
          </div>
        </Section>

        <div className="lg:col-span-2"><AccountsCard /></div>

        <Section icon={Package} title="Kits de démarrage" className="lg:col-span-2">
          <p className="text-xs text-gray-500 mb-3">Typologies, check-lists et gammes préventives prêtes à l’emploi, à ajuster ensuite.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {KITS.map(k => (
              <div key={k.id} className="rounded-2xl border border-border p-3 flex items-start justify-between gap-3">
                <div><div className="text-sm font-bold text-dark">{k.name}</div><div className="text-xs text-gray-500 mt-0.5">{k.description}</div></div>
                <Button small variant="secondary" onClick={() => applyKit(k.id, k.name)}>Appliquer</Button>
              </div>
            ))}
          </div>
        </Section>

        {g.backend.mode === 'demo' && (
          <Card className="p-5 lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <div><Label>Mode démonstration</Label><p className="text-sm text-gray-500 mt-1">Données fictives stockées dans ce navigateur uniquement.</p></div>
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={resetDemo}>Réinitialiser la démo</Button>
          </Card>
        )}
      </div>
      {modal?.t === 'chk' && <ChecklistModal edit={modal.edit} onClose={() => setModal(null)} />}
      {modal?.t === 'site' && <SiteModal edit={modal.edit} onClose={() => setModal(null)} />}
      {modal?.t === 'typ' && <TypologyModal edit={modal.edit} onClose={() => setModal(null)} />}
      {modal?.t === 'client' && <ClientModal edit={modal.edit} onClose={() => setModal(null)} />}
    </div>
  );
};
