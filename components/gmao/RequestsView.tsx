import React, { useMemo, useState } from 'react';
import { Plus, ShieldAlert, Scale, Inbox, ArrowRight, Wrench } from 'lucide-react';
import {
  AssetState, Impact, INTERVENTION_TYPES, Priority, PRIORITIES, PRIORITY_LABEL, PRODUCTION_IMPACT_LABEL,
  ProductionImpact, RequestStatus, REQUEST_STATUS_LABEL, STATE_LABEL, WorkRequest,
} from '../../functions/src/gmao/model';
import { priorityReason, suggestPriority } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Button, Card, Empty, Field, fmtDateTime, Info, Label, Modal, PageHeader, PhotoInput, PhotoStrip,
  PriorityBadge, PRIORITY_CLASS, ReqStatusBadge, Segmented, Select, Textarea, Input, relativeDays, Badge,
} from './ui';

// ─── Formulaire de demande ───────────────────────────────────────────────────

export const RequestFormModal: React.FC<{ onClose: () => void; assetId?: string }> = ({ onClose, assetId: initialAsset }) => {
  const { assets, siteName, run, backend, isResp, openWorkOrder } = useGmao();
  const [assetId, setAssetId] = useState(initialAsset || '');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [impact, setImpact] = useState<Impact>({ safety: false, regulatory: false, production: 'AUCUN' });
  const [declaredState, setDeclaredState] = useState<AssetState>('OPERATIONNEL');
  const [override, setOverride] = useState<Priority | ''>('');
  const [autoApprove, setAutoApprove] = useState(isResp);
  const [interventionType, setInterventionType] = useState('MECANIQUE');
  const [saving, setSaving] = useState(false);

  const suggested = suggestPriority(impact);
  const priority = (isResp && override) || suggested;

  const submit = async () => {
    setSaving(true);
    const res = await run('REQUEST_CREATE', {
      assetId, description, photos, impact, declaredState,
      priority: isResp ? priority : undefined,
      autoApprove: isResp && autoApprove, interventionType,
    });
    setSaving(false);
    if (res) {
      onClose();
      if (res.workOrderId) openWorkOrder(res.workOrderId);
    }
  };

  const ImpactToggle = ({ k, icon, label }: { k: 'safety' | 'regulatory'; icon: React.ReactNode; label: string }) => (
    <button type="button" onClick={() => setImpact(i => ({ ...i, [k]: !i[k] }))}
      className={`flex-1 min-w-[140px] rounded-2xl border px-3 py-3 text-left transition-all ${impact[k] ? 'border-danger bg-danger/5' : 'border-border'}`}>
      <div className={`flex items-center gap-2 text-sm font-bold ${impact[k] ? 'text-danger' : 'text-dark'}`}>{icon}{label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{impact[k] ? 'Oui' : 'Non'}</div>
    </button>
  );

  return (
    <Modal
      title="Nouvelle demande d'intervention"
      subtitle="Décrivez le problème : la priorité est proposée automatiquement."
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={submit} loading={saving} disabled={!assetId || !description.trim()}>
          {isResp && autoApprove ? 'Créer et ouvrir le BT' : 'Envoyer la demande'}
        </Button>
      </>}
    >
      <Field label="Équipement concerné" required>
        <AssetPicker assets={assets} value={assetId} onChange={setAssetId} siteName={siteName} autoFocus={!initialAsset} />
      </Field>
      <Field label="Description du problème" required>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ce que vous constatez, depuis quand, dans quelles conditions…" />
      </Field>
      <Field label="Photos">
        <PhotoInput value={photos} onChange={setPhotos} upload={f => backend.upload('requests', f)} />
      </Field>

      <div>
        <Label className="mb-2">Impact</Label>
        <div className="flex flex-wrap gap-2">
          <ImpactToggle k="safety" icon={<ShieldAlert size={16} />} label="Sécurité" />
          <ImpactToggle k="regulatory" icon={<Scale size={16} />} label="Réglementaire" />
        </div>
        <div className="mt-2">
          <Field label="Effet sur l'exploitation">
            <Select value={impact.production} onChange={e => setImpact(i => ({ ...i, production: e.target.value as ProductionImpact }))}>
              {(Object.keys(PRODUCTION_IMPACT_LABEL) as ProductionImpact[]).map(k => <option key={k} value={k}>{PRODUCTION_IMPACT_LABEL[k]}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="État actuel de la machine">
        <Segmented value={declaredState} onChange={setDeclaredState} options={[
          { value: 'OPERATIONNEL', label: 'Fonctionne' },
          { value: 'DEGRADE', label: 'Mode dégradé' },
          { value: 'INDISPONIBLE', label: "À l'arrêt" },
        ]} />
      </Field>

      <div className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${priority === 'P1' ? 'bg-danger/5' : 'bg-gray-50'}`}>
        <div>
          <Label>Priorité proposée</Label>
          <div className="text-sm font-bold text-dark mt-1">{PRIORITY_LABEL[suggested]}</div>
          <div className="text-[11px] text-gray-500">{priorityReason(impact)}</div>
        </div>
        <PriorityBadge p={priority} />
      </div>

      {isResp && (
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <Label>Responsable maintenance</Label>
          <Field label="Priorité retenue">
            <Select value={override} onChange={e => setOverride(e.target.value as any)}>
              <option value="">Priorité proposée ({suggested})</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-dark">
            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
            Approuver directement et créer le bon de travail
          </label>
          {autoApprove && (
            <Field label="Type d'intervention">
              <Select value={interventionType} onChange={e => setInterventionType(e.target.value)}>
                {INTERVENTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
};

// ─── Détail / décision ───────────────────────────────────────────────────────

export const RequestDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { requests, run, isResp, siteName, openWorkOrder, openAsset, prompt, assetById, checklists } = useGmao();
  const req = requests.find(r => r.id === id);
  const [priority, setPriority] = useState<Priority | ''>('');
  const [interventionType, setInterventionType] = useState('MECANIQUE');
  const [title, setTitle] = useState('');
  const [checklistId, setChecklistId] = useState('');
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const asset = assetById(req.assetId);

  const approve = async () => {
    setBusy(true);
    const res = await run('REQUEST_APPROVE', { id: req.id, priority: priority || req.priority, interventionType, title, checklistId: checklistId || null }, 'Demande approuvée, bon de travail créé.');
    setBusy(false);
    if (res) { onClose(); openWorkOrder(res.workOrderId); }
  };
  const cancel = async () => {
    const reason = await prompt({ title: 'Annuler la demande', message: 'Indiquez le motif (il sera visible par le demandeur).', required: true, variant: 'danger', confirmLabel: 'Annuler la demande' });
    if (!reason) return;
    const restore = asset && asset.state !== 'OPERATIONNEL' && asset.stateReason?.startsWith(req.number);
    const res = await run('REQUEST_CANCEL', { id: req.id, reason, restoreAssetState: restore }, 'Demande annulée.');
    if (res) onClose();
  };

  return (
    <Modal
      title={`${req.number} · ${req.assetCode}`}
      subtitle={req.assetName}
      onClose={onClose}
      footer={isResp && req.status === 'A_APPROUVER' ? <>
        <Button variant="danger" onClick={cancel}>Annuler la demande</Button>
        <Button onClick={approve} loading={busy} icon={<Wrench size={16} />}>Approuver et créer le BT</Button>
      </> : req.workOrderId ? <Button variant="secondary" onClick={() => { onClose(); openWorkOrder(req.workOrderId!); }} icon={<ArrowRight size={16} />}>Voir le bon de travail</Button> : undefined}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <ReqStatusBadge s={req.status} />
        <PriorityBadge p={req.priority} />
        <Badge className="bg-gray-100 text-gray-600">Échéance {relativeDays(req.dueDate)}</Badge>
      </div>
      <p className="text-sm text-dark whitespace-pre-wrap">{req.description}</p>
      <PhotoStrip urls={req.photos} />
      <div className="grid grid-cols-2 gap-4">
        <Info label="Demandeur">{req.requesterName}</Info>
        <Info label="Créée le">{fmtDateTime(req.createdAt)}</Info>
        <Info label="Site">{siteName(req.siteId)}</Info>
        <Info label="État déclaré">{STATE_LABEL[req.declaredState]}</Info>
        <Info label="Impact">
          {[req.impact.safety && 'Sécurité', req.impact.regulatory && 'Réglementaire', PRODUCTION_IMPACT_LABEL[req.impact.production]].filter(Boolean).join(' · ')}
        </Info>
        <Info label="Priorité proposée">{req.suggestedPriority}</Info>
      </div>
      {asset && <button onClick={() => { onClose(); openAsset(asset.id); }} className="text-sm font-bold text-primary">Ouvrir la fiche {asset.code} →</button>}
      {req.cancelReason && <Info label="Motif d'annulation">{req.cancelReason}</Info>}
      {req.decisionByName && <Info label="Décision">{req.decisionByName} · {fmtDateTime(req.decisionAt)}</Info>}

      {isResp && req.status === 'A_APPROUVER' && (
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <Label>Bon de travail à créer</Label>
          <Field label="Intitulé" hint="Par défaut : début de la description.">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={req.description.slice(0, 80)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Priorité">
              <Select value={priority || req.priority} onChange={e => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Type d'intervention">
              <Select value={interventionType} onChange={e => setInterventionType(e.target.value)}>
                {INTERVENTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Check-list à remplir à la clôture">
            <Select value={checklistId} onChange={e => setChecklistId(e.target.value)}>
              <option value="">Aucune</option>
              {checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
};

// ─── Liste ───────────────────────────────────────────────────────────────────

const FILTERS: { value: 'OPEN' | RequestStatus | 'ALL' | 'MINE'; label: string }[] = [
  { value: 'OPEN', label: 'En cours' },
  { value: 'A_APPROUVER', label: 'À approuver' },
  { value: 'MINE', label: 'Mes demandes' },
  { value: 'CLOTUREE', label: 'Clôturées' },
  { value: 'ALL', label: 'Toutes' },
];

export const RequestsView: React.FC = () => {
  const { requests, me, isResp, siteName, openRequest } = useGmao();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>(isResp ? 'A_APPROUVER' : 'MINE');

  const list = useMemo(() => {
    let l = [...requests];
    if (filter === 'OPEN') l = l.filter(r => ['A_APPROUVER', 'APPROUVEE', 'PLANIFIEE'].includes(r.status));
    else if (filter === 'MINE') l = l.filter(r => r.requesterId === me.id);
    else if (filter !== 'ALL') l = l.filter(r => r.status === filter);
    return l.sort((a, b) => (a.status === 'A_APPROUVER' ? 0 : 1) - (b.status === 'A_APPROUVER' ? 0 : 1) || a.priority.localeCompare(b.priority) || b.createdAt.localeCompare(a.createdAt));
  }, [requests, filter, me.id]);

  const toApprove = requests.filter(r => r.status === 'A_APPROUVER').length;

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Demandes d'intervention"
        subtitle={isResp ? `${toApprove} demande(s) à approuver` : 'Signalez un problème sur un équipement et suivez son traitement.'}
        actions={<Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouvelle demande</Button>}
      />
      <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={FILTERS} /></div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty><Inbox className="mx-auto mb-2 text-gray-300" />Aucune demande.</Empty> : list.map(r => (
          <button key={r.id} onClick={() => openRequest(r.id)} className="w-full text-left px-4 sm:px-5 py-4 border-b border-border last:border-0 hover:bg-gray-50/70 flex items-start gap-3">
            <div className={`w-1.5 self-stretch rounded-full ${PRIORITY_CLASS[r.priority].split(' ')[0]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-dark">{r.assetCode}</span>
                <span className="text-sm text-gray-600 truncate">{r.assetName}</span>
                <ReqStatusBadge s={r.status} />
              </div>
              <div className="text-sm text-dark mt-1 line-clamp-2">{r.description}</div>
              <div className="text-[11px] text-gray-400 mt-1">{r.number} · {r.requesterName} · {fmtDateTime(r.createdAt)} · {siteName(r.siteId)}{r.photos?.length ? ` · ${r.photos.length} photo(s)` : ''}</div>
            </div>
            <PriorityBadge p={r.priority} />
          </button>
        ))}
      </Card>
      {creating && <RequestFormModal onClose={() => setCreating(false)} />}
    </div>
  );
};

