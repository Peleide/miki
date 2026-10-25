import React, { useMemo, useState } from 'react';
import { Plus, ShieldAlert, Inbox, ArrowRight, Wrench, QrCode, MessageSquare, Check, Ban } from 'lucide-react';
import {
  AssetState, OPEN_REQUEST_STATUSES, Priority, PRIORITIES, RequestStatus, STATE_LABEL, WorkRequest, priorityLabel,
} from '../../functions/src/gmao/model';
import { priorityReason, suggestPriority } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, Empty, Field, fmtDateTime, Info, Label, Modal, PageHeader, PhotoInput, PhotoStrip,
  PriorityBadge, PRIORITY_CLASS, ReqStatusBadge, Segmented, Select, Textarea, Input, relativeDays, UserChips, telHref,
} from './ui';

// ─── Formulaire (compte connecté) ────────────────────────────────────────────

export const RequestFormModal: React.FC<{ onClose: () => void; assetId?: string; kind?: 'PROBLEME' | 'REMARQUE' }> = ({ onClose, assetId: initialAsset, kind: initialKind = 'PROBLEME' }) => {
  const { assets, siteName, run, backend, isResp, isTech, settings, users, openWorkOrder, mine } = useGmao();
  const [assetId, setAssetId] = useState(initialAsset || '');
  const [kind, setKind] = useState<'PROBLEME' | 'REMARQUE'>(initialKind);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [safety, setSafety] = useState(false);
  const [declaredState, setDeclaredState] = useState<AssetState>('OPERATIONNEL');
  const [override, setOverride] = useState<Priority | ''>('');
  const [autoApprove, setAutoApprove] = useState(true);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [takeIt, setTakeIt] = useState(false);
  const [saving, setSaving] = useState(false);

  const suggested = suggestPriority({ safety, declaredState, remark: kind === 'REMARQUE' });
  const priority = (isResp && override) || suggested;
  const asset = assets.find(a => a.id === assetId);
  const direct = kind === 'PROBLEME' && (isResp ? autoApprove : !settings.requireApproval);

  const submit = async () => {
    setSaving(true);
    const res = await run('REQUEST_CREATE', {
      assetId, kind, description, photos, safety, declaredState,
      priority: isResp ? priority : undefined,
      autoApprove: isResp ? autoApprove : undefined,
      assigneeIds: isResp && autoApprove ? assigneeIds : undefined,
      takeIt: isTech && takeIt,
    }, kind === 'REMARQUE' ? 'Remarque transmise.' : direct ? 'Intervention créée.' : 'Signalement transmis.');
    setSaving(false);
    if (res) {
      onClose();
      if (res.workOrderId && !assetId) openWorkOrder(res.workOrderId);
    }
  };

  return (
    <Modal
      title={kind === 'REMARQUE' ? 'Laisser une remarque' : 'Signaler un problème'}
      subtitle={kind === 'REMARQUE' ? 'Une information pour l’équipe maintenance, sans intervention.' : 'La priorité est proposée selon l’état de la machine.'}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button onClick={submit} loading={saving} disabled={!assetId || !description.trim()}>{kind === 'REMARQUE' ? 'Envoyer' : direct ? 'Créer l’intervention' : 'Envoyer le signalement'}</Button>
      </>}
    >
      <Segmented value={kind} onChange={setKind} options={[{ value: 'PROBLEME', label: 'Problème' }, { value: 'REMARQUE', label: 'Remarque' }]} />
      <Field label="Machine" required>
        <AssetPicker assets={assets} value={assetId} onChange={setAssetId} siteName={siteName} autoFocus={!initialAsset} />
      </Field>
      <Field label={kind === 'REMARQUE' ? 'Remarque' : 'Description du problème'} required>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={kind === 'REMARQUE' ? 'Ex. : prévenir l’accueil avant le passage…' : 'Ce que vous constatez, depuis quand…'} />
      </Field>
      <Field label="Photos"><PhotoInput value={photos} onChange={setPhotos} upload={f => backend.upload('requests', f)} /></Field>

      {kind === 'PROBLEME' && <>
        <Field label="La machine est-elle utilisable ?">
          <Segmented value={declaredState} onChange={setDeclaredState} options={[
            { value: 'OPERATIONNEL', label: 'Oui' },
            { value: 'DEGRADE', label: 'Avec difficulté' },
            { value: 'INDISPONIBLE', label: 'Non, à l’arrêt' },
          ]} />
        </Field>
        <button type="button" onClick={() => setSafety(!safety)} className={`w-full rounded-2xl border px-4 py-3 text-left flex items-center gap-3 ${safety ? 'border-danger bg-danger/5' : 'border-border'}`}>
          <ShieldAlert size={18} className={safety ? 'text-danger' : 'text-gray-400'} />
          <span className={`text-sm font-bold ${safety ? 'text-danger' : 'text-dark'}`}>Danger pour les personnes</span>
          <span className="ml-auto text-xs text-gray-500">{safety ? 'Oui' : 'Non'}</span>
        </button>
        <div className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${priority === 'P1' ? 'bg-danger/5' : 'bg-gray-50'}`}>
          <div>
            <Label>Priorité proposée</Label>
            <div className="text-sm font-bold text-dark mt-1">{priorityLabel(suggested, settings.priorityDelays)}</div>
            <div className="text-[11px] text-gray-500">{priorityReason({ safety, declaredState })}</div>
          </div>
          <PriorityBadge p={priority} />
        </div>
        {isResp && (
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <Field label="Priorité retenue">
              <Select value={override} onChange={e => setOverride(e.target.value as any)}>
                <option value="">Proposée ({priorityLabel(suggested, settings.priorityDelays)})</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p, settings.priorityDelays)}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-dark">
              <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
              Créer directement l’intervention
            </label>
            {autoApprove && <Field label="Attribuer à" hint="Vide : le technicien du parc de la machine s’il est seul."><UserChips users={users.filter(u => u.role === 'TECHNICIEN' && (!asset || !asset.technicianIds?.length || asset.technicianIds.includes(u.id)))} value={assigneeIds} onChange={setAssigneeIds} /></Field>}
          </div>
        )}
        {isTech && direct && asset && mine(asset) && (
          <label className="flex items-center gap-2 text-sm font-semibold text-dark">
            <input type="checkbox" checked={takeIt} onChange={e => setTakeIt(e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
            Je m’en occupe
          </label>
        )}
      </>}
    </Modal>
  );
};

// ─── Détail / décision ───────────────────────────────────────────────────────

export const RequestDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const g = useGmao();
  const req = g.requests.find(r => r.id === id);
  const [priority, setPriority] = useState<Priority | ''>('');
  const [interventionType, setInterventionType] = useState('');
  const [title, setTitle] = useState('');
  const [checklistId, setChecklistId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const asset = g.assetById(req.assetId);
  const canDecide = req.status === 'A_TRAITER' && (g.isResp || (g.isTech && !g.settings.requireApproval && g.mine(asset)));

  const approve = async () => {
    setBusy(true);
    const res = await g.run('REQUEST_APPROVE', { id: req.id, priority: priority || req.priority, interventionType: interventionType || undefined, title, checklistId: checklistId || null, assigneeIds, takeIt: g.isTech }, 'Intervention créée.');
    setBusy(false);
    if (res) { onClose(); g.openWorkOrder(res.workOrderId); }
  };
  const cancel = async (falseReport: boolean) => {
    const reason = await g.prompt({ title: falseReport ? 'Faux signalement' : 'Classer sans suite', message: 'Motif (visible par l’auteur s’il a un compte).', required: true, variant: 'danger', confirmLabel: 'Classer', defaultValue: falseReport ? 'Faux signalement.' : '' });
    if (!reason) return;
    const restore = asset && asset.state !== 'OPERATIONNEL' && asset.stateReason?.startsWith(req.number);
    const res = await g.run('REQUEST_CANCEL', { id: req.id, reason, falseReport, restoreAssetState: restore }, 'Signalement classé.');
    if (res) onClose();
  };
  const ack = async () => {
    const note = await g.prompt({ title: 'Réponse (facultative)', message: 'Un mot pour l’auteur de la remarque.', confirmLabel: 'Marquer comme lue' });
    if (note === null) return;
    const res = await g.run('REQUEST_ACK', { id: req.id, note }, 'Remarque marquée comme lue.');
    if (res) onClose();
  };

  const footer = canDecide ? (req.kind === 'REMARQUE'
    ? <Button onClick={ack} icon={<Check size={16} />}>Marquer comme lue</Button>
    : <>
      <Button variant="ghost" small icon={<Ban size={14} />} onClick={() => cancel(true)}>Faux signalement</Button>
      <Button variant="danger" small onClick={() => cancel(false)}>Classer sans suite</Button>
      <Button onClick={approve} loading={busy} icon={<Wrench size={16} />}>{g.isTech ? 'Je m’en occupe' : 'Créer l’intervention'}</Button>
    </>)
    : req.workOrderId && !g.isClient ? <Button variant="secondary" onClick={() => { onClose(); g.openWorkOrder(req.workOrderId!); }} icon={<ArrowRight size={16} />}>Voir l’intervention</Button> : undefined;

  return (
    <Modal title={`${req.number} · ${req.assetCode}`} subtitle={req.assetName} onClose={onClose} footer={footer}>
      <div className="flex flex-wrap gap-2 items-center">
        <ReqStatusBadge s={req.status} />
        {req.kind === 'REMARQUE' ? <Badge className="bg-blue-50 text-blue-600"><MessageSquare size={10} />Remarque</Badge> : <PriorityBadge p={req.priority} />}
        {req.source === 'QR_PUBLIC' && <Badge className="bg-gray-100 text-gray-600"><QrCode size={10} />QR code public</Badge>}
        {req.safety && <Badge className="bg-danger text-white"><ShieldAlert size={10} />Danger</Badge>}
        {req.falseReport && <Badge className="bg-gray-200 text-gray-600">Faux signalement</Badge>}
      </div>
      <p className="text-sm text-dark whitespace-pre-wrap">{req.description}</p>
      <PhotoStrip urls={req.photos} />
      <div className="grid grid-cols-2 gap-4">
        <Info label="Auteur">{req.requesterName}{req.requesterContact && <> · <a href={telHref(req.requesterContact)} className="text-primary font-bold">{req.requesterContact}</a></>}</Info>
        <Info label="Créé le">{fmtDateTime(req.createdAt)}</Info>
        <Info label="Site">{g.siteName(req.siteId)}</Info>
        {req.kind === 'PROBLEME' && <Info label="Machine utilisable">{req.declaredState === 'OPERATIONNEL' ? 'Oui' : STATE_LABEL[req.declaredState]}</Info>}
        {req.kind === 'PROBLEME' && <Info label="À traiter">{relativeDays(req.dueDate)}</Info>}
        {req.clientId && <Info label="Client">{g.clientName(req.clientId)}</Info>}
      </div>
      {asset && <button onClick={() => { onClose(); g.openAsset(asset.id); }} className="text-sm font-bold text-primary">Ouvrir la fiche {asset.code} →</button>}
      {req.cancelReason && <Info label={req.status === 'CLOTUREE' ? 'Réponse' : 'Motif'}>{req.cancelReason}</Info>}
      {req.decisionByName && <Info label="Traité par">{req.decisionByName} · {fmtDateTime(req.decisionAt)}</Info>}

      {canDecide && req.kind === 'PROBLEME' && (
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <Label>Intervention à créer</Label>
          <Field label="Intitulé" hint="Par défaut : début de la description."><Input value={title} onChange={e => setTitle(e.target.value)} placeholder={req.description.slice(0, 80)} /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Priorité">
              <Select value={priority || req.priority} onChange={e => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p, g.settings.priorityDelays)}</option>)}
              </Select>
            </Field>
            <Field label="Type d'intervention">
              <Select value={interventionType || g.settings.interventionTypes[0]} onChange={e => setInterventionType(e.target.value)}>
                {g.settings.interventionTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Check-list à la clôture">
            <Select value={checklistId} onChange={e => setChecklistId(e.target.value)}>
              <option value="">Aucune</option>
              {g.checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {g.isResp && <Field label="Attribuer à" hint="Vide : le technicien du parc s’il est seul."><UserChips users={g.users.filter(u => u.role === 'TECHNICIEN' && (!asset?.technicianIds?.length || asset.technicianIds.includes(u.id)))} value={assigneeIds} onChange={setAssigneeIds} /></Field>}
        </div>
      )}
    </Modal>
  );
};

// ─── Liste ───────────────────────────────────────────────────────────────────

type Filter = 'A_TRAITER' | 'OPEN' | 'MINE' | 'CLOTUREE' | 'ALL';

export const RequestsView: React.FC = () => {
  const g = useGmao();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>(g.isClient ? 'OPEN' : 'A_TRAITER');
  const visible = useMemo(() => g.requests.filter(r => !g.isTech || g.mine(g.assetById(r.assetId)) || r.requesterId === g.me.id), [g.requests, g.assets]);

  const list = useMemo(() => {
    let l = [...visible];
    if (filter === 'A_TRAITER') l = l.filter(r => r.status === 'A_TRAITER');
    else if (filter === 'OPEN') l = l.filter(r => OPEN_REQUEST_STATUSES.includes(r.status));
    else if (filter === 'MINE') l = l.filter(r => r.requesterId === g.me.id);
    else if (filter === 'CLOTUREE') l = l.filter(r => ['CLOTUREE', 'ANNULEE'].includes(r.status));
    return l.sort((a, b) => (a.status === 'A_TRAITER' ? 0 : 1) - (b.status === 'A_TRAITER' ? 0 : 1) || a.priority.localeCompare(b.priority) || b.createdAt.localeCompare(a.createdAt));
  }, [visible, filter, g.me.id]);

  const pending = visible.filter(r => r.status === 'A_TRAITER').length;
  const filters: { value: Filter; label: string }[] = [
    ...(!g.isClient ? [{ value: 'A_TRAITER' as Filter, label: `À traiter${pending ? ` (${pending})` : ''}` }] : []),
    { value: 'OPEN', label: 'En cours' },
    { value: 'MINE', label: g.isClient ? 'Les miens' : 'Mes signalements' },
    { value: 'CLOTUREE', label: 'Traités' },
    { value: 'ALL', label: 'Tous' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Signalements"
        subtitle={g.isClient ? 'Signalez un problème ou laissez une remarque sur une machine, et suivez la réponse.' : `${pending} signalement(s) à traiter · y compris ceux reçus par QR code`}
        actions={<Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouveau signalement</Button>}
      />
      <div className="mb-4"><Segmented value={filter} onChange={setFilter} options={filters} /></div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty><Inbox className="mx-auto mb-2 text-gray-300" />Aucun signalement.</Empty> : list.map(r => <RequestRow key={r.id} r={r} />)}
      </Card>
      {creating && <RequestFormModal onClose={() => setCreating(false)} />}
    </div>
  );
};

export const RequestRow: React.FC<{ r: WorkRequest }> = ({ r }) => {
  const g = useGmao();
  return (
    <button onClick={() => g.openRequest(r.id)} className="w-full text-left px-4 sm:px-5 py-4 border-b border-border last:border-0 hover:bg-gray-50/70 flex items-start gap-3">
      <div className={`w-1.5 self-stretch rounded-full ${r.kind === 'REMARQUE' ? 'bg-blue-200' : PRIORITY_CLASS[r.priority].split(' ')[0]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-dark">{r.assetCode}</span>
          <span className="text-sm text-gray-600 truncate">{r.assetName}</span>
          <ReqStatusBadge s={r.status as RequestStatus} />
          {r.source === 'QR_PUBLIC' && <Badge className="bg-gray-100 text-gray-500"><QrCode size={10} />QR</Badge>}
          {r.kind === 'REMARQUE' && <Badge className="bg-blue-50 text-blue-600">Remarque</Badge>}
        </div>
        <div className="text-sm text-dark mt-1 line-clamp-2">{r.description}</div>
        <div className="text-[11px] text-gray-400 mt-1">{r.number} · {r.requesterName} · {fmtDateTime(r.createdAt)} · {g.siteName(r.siteId)}{r.photos?.length ? ` · ${r.photos.length} photo(s)` : ''}</div>
      </div>
      {r.kind === 'PROBLEME' && <PriorityBadge p={r.priority} />}
    </button>
  );
};
