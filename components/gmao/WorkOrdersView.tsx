import React, { useMemo, useState } from 'react';
import { Plus, Play, CheckCircle2, PauseCircle, XCircle, CalendarClock, Pencil, ShieldCheck, ClipboardList, AlertTriangle, Undo2, Phone, ClipboardCheck } from 'lucide-react';
import {
  Asset, AssetState, ChecklistAnswers, KIND_LABEL, OPEN_WORK_ORDER_STATUSES, PRIORITIES, WorkOrder, WorkOrderStatus,
  METER_UNIT, STATE_LABEL, priorityLabel,
} from '../../functions/src/gmao/model';
import { inPerimeter } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, ChecklistAnswersView, ChecklistForm, Empty, Field, fmtDate,
  fmtDateTime, fmtNum, fmtTime, fromLocalInput, Info, Input, Label, Modal, PageHeader, PhotoInput,
  PhotoStrip, PriorityBadge, Segmented, Select, Textarea, toLocalInput, UserChips, WoStatusBadge, relativeDays,
  fromDateInput, toDateInput, telHref,
} from './ui';

export const isLate = (w: WorkOrder) => OPEN_WORK_ORDER_STATUSES.includes(w.status) && new Date(w.dueDate).getTime() < Date.now();

/** Peut-on démarrer / réaliser cette intervention ? */
export function useCanExecute() {
  const g = useGmao();
  return (wo: WorkOrder) => g.isResp || (g.isTech && (wo.assigneeIds.includes(g.me.id) || (!wo.assigneeIds.length && inPerimeter(g.assetById(wo.assetId), g.me.id))));
}

const ContactLine: React.FC<{ asset?: Asset }> = ({ asset }) => (asset?.contactName || asset?.contactPhone) ? (
  <div className="rounded-2xl bg-blue-50 text-blue-800 text-sm px-4 py-3 flex flex-wrap items-center gap-2">
    <Phone size={16} className="shrink-0" />
    <span>Référent : <b>{asset.contactName || '—'}</b></span>
    {asset.contactPhone && <a href={telHref(asset.contactPhone)} className="ml-auto font-black underline">{asset.contactPhone}</a>}
  </div>
) : null;

// ─── Création / modification ─────────────────────────────────────────────────

export const WorkOrderFormModal: React.FC<{ onClose: () => void; assetId?: string; edit?: WorkOrder }> = ({ onClose, assetId: initialAsset, edit }) => {
  const g = useGmao();
  const [assetId, setAssetId] = useState(edit?.assetId || initialAsset || '');
  const asset = g.assetById(assetId);
  const [f, setF] = useState({
    kind: edit?.kind || 'CORRECTIF',
    title: edit?.title || '',
    description: edit?.description || '',
    priority: edit?.priority || 'P3',
    interventionType: edit?.interventionType || g.settings.interventionTypes[0],
    procedure: edit?.procedure || '',
    checklistId: edit?.checklistId || '',
    safetyCheckRequired: edit ? edit.safetyCheckRequired : !!g.settings.safetyChecklistId,
    estimatedHours: edit?.estimatedHours ?? '',
    resourceType: edit?.resourceType || 'INTERNE',
    externalProvider: edit?.externalProvider || '',
    dueDate: edit ? toDateInput(edit.dueDate) : '',
  });
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    setSaving(true);
    const payload = { ...f, checklistId: f.checklistId || null, dueDate: f.dueDate ? fromDateInput(f.dueDate, 17) : undefined };
    const res = edit
      ? await g.run('WO_UPDATE', { id: edit.id, updates: payload }, 'Intervention mise à jour.')
      : await g.run('WO_CREATE', { ...payload, assetId, assigneeIds }, 'Intervention créée.');
    setSaving(false);
    if (res) { onClose(); if (!edit && res.id) g.openWorkOrder(res.id); }
  };

  return (
    <Modal title={edit ? `Modifier ${edit.number}` : 'Nouvelle intervention'} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!assetId || !f.title.trim()}>{edit ? 'Enregistrer' : 'Créer l’intervention'}</Button>
    </>}>
      {!edit && (
        <>
          <Field label="Machine" required><AssetPicker assets={g.assets.filter(a => g.mine(a))} value={assetId} onChange={setAssetId} siteName={g.siteName} /></Field>
          <Field label="Nature"><Segmented value={f.kind as any} onChange={v => set('kind', v)} options={[{ value: 'CORRECTIF', label: 'Curatif' }, { value: 'PREVENTIF', label: 'Préventif (ponctuel)' }]} /></Field>
        </>
      )}
      <Field label="Intitulé" required><Input value={f.title} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Description"><Textarea value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Priorité"><Select value={f.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p, g.settings.priorityDelays)}</option>)}</Select></Field>
        <Field label="Type d'intervention"><Select value={f.interventionType} onChange={e => set('interventionType', e.target.value)}>{Array.from(new Set([...g.settings.interventionTypes, f.interventionType])).map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <Field label="Échéance" hint="Vide : selon la priorité."><Input type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
      </div>
      <Field label="Mode opératoire" hint="Étapes, consignes, outillage."><Textarea rows={3} value={f.procedure} onChange={e => set('procedure', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Check-list à la clôture">
          <Select value={f.checklistId} onChange={e => set('checklistId', e.target.value)}>
            <option value="">Aucune</option>
            {g.checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Durée estimée (h)"><Input type="number" min={0} step={0.5} value={f.estimatedHours as any} onChange={e => set('estimatedHours', e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Réalisée par"><Segmented value={f.resourceType as any} onChange={v => set('resourceType', v)} options={[{ value: 'INTERNE', label: 'Équipe' }, { value: 'EXTERNE', label: 'Prestataire / garage' }]} /></Field>
        {f.resourceType === 'EXTERNE' && <Field label="Prestataire"><Input value={f.externalProvider} onChange={e => set('externalProvider', e.target.value)} /></Field>}
      </div>
      {!edit && g.isResp && <Field label="Attribuer à" hint="Vide : le technicien du parc de la machine s’il est seul."><UserChips users={g.users.filter(u => u.role === 'TECHNICIEN' && (!asset?.technicianIds?.length || asset.technicianIds.includes(u.id)))} value={assigneeIds} onChange={setAssigneeIds} /></Field>}
      {g.settings.safetyChecklistId && (
        <label className="flex items-center gap-2 text-sm font-semibold text-dark">
          <input type="checkbox" checked={f.safetyCheckRequired} onChange={e => set('safetyCheckRequired', e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
          Analyse de sécurité obligatoire avant de démarrer
        </label>
      )}
    </Modal>
  );
};

// ─── Planification ───────────────────────────────────────────────────────────

export const PlanModal: React.FC<{ wo: WorkOrder; onClose: () => void; defaults?: { start?: string; end?: string; assigneeIds?: string[] } }> = ({ wo, onClose, defaults }) => {
  const { users, run, isTech, me } = useGmao();
  const asset = useGmao().assetById(wo.assetId);
  const techs = users.filter(u => u.role !== 'CLIENT');
  const defaultStart = defaults?.start || wo.plannedStart || (() => { const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); d.setHours(7, 0, 0, 0); return d.toISOString(); })();
  const defaultEnd = defaults?.end || wo.plannedEnd || new Date(new Date(defaultStart).getTime() + Math.max(1, wo.estimatedHours || 2) * 3600000).toISOString();
  const [start, setStart] = useState(toLocalInput(defaultStart));
  const [end, setEnd] = useState(toLocalInput(defaultEnd));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(isTech ? [me.id] : (defaults?.assigneeIds || wo.assigneeIds || []));
  const [resourceType, setResourceType] = useState(wo.resourceType);
  const [externalProvider, setExternalProvider] = useState(wo.externalProvider || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const res = await run('WO_PLAN', { id: wo.id, plannedStart: fromLocalInput(start), plannedEnd: fromLocalInput(end), assigneeIds, resourceType, externalProvider }, 'Intervention planifiée.');
    setSaving(false);
    if (res) onClose();
  };

  return (
    <Modal title={`Planifier ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} icon={<CalendarClock size={16} />}>Planifier</Button>
    </>}>
      <ContactLine asset={asset} />
      {!isTech && <Field label="Réalisée par"><Segmented value={resourceType} onChange={setResourceType} options={[{ value: 'INTERNE', label: 'Équipe' }, { value: 'EXTERNE', label: 'Prestataire / garage' }]} /></Field>}
      {resourceType === 'EXTERNE' && <Field label="Prestataire" required><Input value={externalProvider} onChange={e => setExternalProvider(e.target.value)} /></Field>}
      {!isTech && (
        <Field label={resourceType === 'INTERNE' ? 'Techniciens' : 'Suivi interne (facultatif)'} required={resourceType === 'INTERNE'}>
          <UserChips users={techs} value={assigneeIds} onChange={setAssigneeIds} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Fin"><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      <div className="text-xs text-gray-500">Échéance : {fmtDate(wo.dueDate)} ({relativeDays(wo.dueDate)}){wo.estimatedHours ? ` · durée estimée ${fmtNum(wo.estimatedHours, 1)} h` : ''}</div>
    </Modal>
  );
};

// ─── Analyse de sécurité ─────────────────────────────────────────────────────

const SafetyBlock: React.FC<{ wo: { id?: string; safetyCheckRequired: boolean }; answers: ChecklistAnswers; onChange: (a: ChecklistAnswers) => void }> = ({ wo, answers, onChange }) => {
  const { settings, checklists, backend } = useGmao();
  const safety = wo.safetyCheckRequired ? checklists.find(c => c.id === settings.safetyChecklistId) : undefined;
  if (!safety) return null;
  const blocked = safety.items.some(i => i.type === 'BOOLEAN' && i.required && answers[i.id]?.value === false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-black text-dark"><ShieldCheck size={18} className="text-primary" />{safety.name}</div>
      <ChecklistForm checklist={safety} value={answers} onChange={onChange} upload={f => backend.upload(`workOrders/${wo.id || 'new'}`, f)} safety />
      {blocked && <div className="rounded-2xl bg-danger/10 text-danger text-sm font-bold p-3 flex gap-2"><AlertTriangle size={18} className="shrink-0" />Un point de sécurité n'est pas validé : n’intervenez pas, prévenez le responsable.</div>}
    </div>
  );
};
const safetyBlocked = (g: ReturnType<typeof useGmao>, required: boolean, answers: ChecklistAnswers) => {
  const safety = required ? g.checklists.find(c => c.id === g.settings.safetyChecklistId) : undefined;
  return !!safety?.items.some(i => i.type === 'BOOLEAN' && i.required && answers[i.id]?.value === false);
};

const StartModal: React.FC<{ wo: WorkOrder; onClose: () => void }> = ({ wo, onClose }) => {
  const g = useGmao();
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [immobilize, setImmobilize] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const res = await g.run('WO_START', { id: wo.id, safetyAnswers: answers, immobilize }, 'Intervention démarrée.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal title={`Démarrer ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={safetyBlocked(g, wo.safetyCheckRequired, answers)} icon={<Play size={16} />}>Démarrer</Button>
    </>}>
      {wo.procedure && <div className="rounded-2xl bg-gray-50 p-4"><Label className="mb-1">Mode opératoire</Label><p className="text-sm whitespace-pre-wrap text-dark">{wo.procedure}</p></div>}
      <SafetyBlock wo={wo} answers={answers} onChange={setAnswers} />
      <label className="flex items-center gap-2 text-sm font-semibold text-dark">
        <input type="checkbox" checked={immobilize} onChange={e => setImmobilize(e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
        Immobiliser la machine pendant l'intervention (« à l’arrêt »)
      </label>
    </Modal>
  );
};

// ─── Compte rendu (clôture d'une intervention existante ou saisie directe) ──

const ReportFields: React.FC<{
  asset?: Asset; checklistId?: string | null; uploadKey: string;
  value: any; set: (k: string, v: any) => void;
}> = ({ asset, checklistId, uploadKey, value: f, set }) => {
  const g = useGmao();
  const checklist = g.checklists.find(c => c.id === checklistId);
  return (
    <>
      <Field label="Compte rendu" required hint="Ce qui a été constaté et fait, pièces changées, points à surveiller.">
        <Textarea rows={4} value={f.report} onChange={e => set('report', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><Input type="datetime-local" value={f.start} onChange={e => set('start', e.target.value)} /></Field>
        <Field label="Fin"><Input type="datetime-local" value={f.end} onChange={e => set('end', e.target.value)} /></Field>
      </div>
      {checklist && <div><Label className="mb-2">{checklist.name}</Label><ChecklistForm checklist={checklist} value={f.answers} onChange={v => set('answers', v)} upload={file => g.backend.upload(uploadKey, file)} /></div>}
      <Field label="Photos"><PhotoInput value={f.photos} onChange={v => set('photos', v)} upload={file => g.backend.upload(uploadKey, file)} /></Field>
      {asset?.meterType && (
        <Field label={`Relevé compteur (${METER_UNIT[asset.meterType]})`} hint={`Dernier relevé : ${fmtNum(asset.meterValue)} ${METER_UNIT[asset.meterType]}`}>
          <Input type="number" inputMode="numeric" value={f.meter} onChange={e => set('meter', e.target.value)} />
        </Field>
      )}
      <Field label="État de la machine après intervention">
        <Segmented value={f.state as AssetState} onChange={v => set('state', v)} options={[{ value: 'OPERATIONNEL', label: 'Opérationnelle' }, { value: 'DEGRADE', label: 'Mode dégradé' }, { value: 'INDISPONIBLE', label: 'Toujours à l’arrêt' }]} />
      </Field>
      {f.state !== 'OPERATIONNEL' && <Field label="Motif"><Input value={f.stateReason} onChange={e => set('stateReason', e.target.value)} placeholder="Ex. : attente pièce" /></Field>}
    </>
  );
};

const defaultTimes = (wo?: WorkOrder) => {
  const now = new Date();
  const limit = now.getTime() - 5 * 60000;
  let start: string;
  if (wo?.startedAt && new Date(wo.startedAt).getTime() < limit) start = wo.startedAt;
  else if (wo?.plannedStart && new Date(wo.plannedStart).getTime() < limit) start = wo.plannedStart;
  else start = new Date(now.getTime() - Math.max(0.5, wo?.estimatedHours || 1) * 3600000).toISOString();
  return { start: toLocalInput(start), end: toLocalInput(now.toISOString()) };
};

export const CloseModal: React.FC<{ wo: WorkOrder; onClose: () => void }> = ({ wo, onClose }) => {
  const g = useGmao();
  const asset = g.assetById(wo.assetId);
  const [f, setF] = useState({ report: '', ...defaultTimes(wo), answers: {} as ChecklistAnswers, photos: [] as string[], meter: '', state: 'OPERATIONNEL', stateReason: '' });
  const [safety, setSafety] = useState<ChecklistAnswers>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const needSafety = wo.status !== 'EN_COURS' && wo.safetyCheckRequired;
  const submit = async () => {
    setSaving(true);
    const res = await g.run('WO_CLOSE', {
      id: wo.id, report: f.report, actualStart: fromLocalInput(f.start), actualEnd: fromLocalInput(f.end),
      checklistAnswers: wo.checklistId ? f.answers : undefined, photos: f.photos, safetyAnswers: needSafety ? safety : undefined,
      meterAtClose: f.meter || undefined, assetStateAfter: f.state, assetStateReason: f.stateReason,
    }, 'Intervention réalisée.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal title={`Réaliser ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button variant="success" onClick={submit} loading={saving} disabled={!f.report.trim() || (needSafety && safetyBlocked(g, true, safety))} icon={<CheckCircle2 size={16} />}>Valider la maintenance</Button>
    </>}>
      {wo.procedure && <div className="rounded-2xl bg-gray-50 p-4"><Label className="mb-1">Mode opératoire</Label><p className="text-sm whitespace-pre-wrap text-dark">{wo.procedure}</p></div>}
      {needSafety && <SafetyBlock wo={wo} answers={safety} onChange={setSafety} />}
      <ReportFields asset={asset} checklistId={wo.checklistId} uploadKey={`workOrders/${wo.id}`} value={f} set={set} />
    </Modal>
  );
};

/** Intervention faite sur place, sans intervention préalable (après un scan). */
export const RecordModal: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const g = useGmao();
  const typology = g.typologies.find(t => t.id === asset.typologyId);
  const [meta, setMeta] = useState({ kind: 'CORRECTIF', title: '', interventionType: g.settings.interventionTypes[0], checklistId: '' });
  const [f, setF] = useState({ report: '', ...defaultTimes(), answers: {} as ChecklistAnswers, photos: [] as string[], meter: '', state: 'OPERATIONNEL', stateReason: '' });
  const [safety, setSafety] = useState<ChecklistAnswers>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const needSafety = !!g.settings.safetyChecklistId;
  const submit = async () => {
    setSaving(true);
    const res = await g.run('WO_RECORD', {
      assetId: asset.id, kind: meta.kind, title: meta.title, interventionType: meta.interventionType, checklistId: meta.checklistId || null,
      report: f.report, actualStart: fromLocalInput(f.start), actualEnd: fromLocalInput(f.end),
      checklistAnswers: meta.checklistId ? f.answers : undefined, photos: f.photos, safetyAnswers: needSafety ? safety : undefined,
      meterAtClose: f.meter || undefined, assetStateAfter: f.state, assetStateReason: f.stateReason,
    }, 'Intervention enregistrée.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal title="Intervention réalisée" subtitle={`${asset.code} · ${asset.name}`} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button variant="success" onClick={submit} loading={saving} disabled={!meta.title.trim() || !f.report.trim() || (needSafety && safetyBlocked(g, true, safety))} icon={<CheckCircle2 size={16} />}>Enregistrer</Button>
    </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nature"><Segmented value={meta.kind} onChange={v => { setMeta({ ...meta, kind: v, checklistId: v === 'PREVENTIF' ? (meta.checklistId || typology?.defaultChecklistId || '') : meta.checklistId }); set('answers', {}); }} options={[{ value: 'CORRECTIF', label: 'Curatif' }, { value: 'PREVENTIF', label: 'Préventif' }]} /></Field>
        <Field label="Type"><Select value={meta.interventionType} onChange={e => setMeta({ ...meta, interventionType: e.target.value })}>{g.settings.interventionTypes.map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
      </div>
      <Field label="Intitulé" required><Input value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} placeholder="Ex. : remplacement bavette, vidange…" /></Field>
      <Field label="Check-list">
        <Select value={meta.checklistId} onChange={e => { setMeta({ ...meta, checklistId: e.target.value }); set('answers', {}); }}>
          <option value="">Aucune</option>
          {g.checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      {needSafety && <SafetyBlock wo={{ safetyCheckRequired: true }} answers={safety} onChange={setSafety} />}
      <ReportFields asset={asset} checklistId={meta.checklistId} uploadKey={`assets/${asset.id}`} value={f} set={set} />
    </Modal>
  );
};

// ─── Détail ──────────────────────────────────────────────────────────────────

export const WorkOrderDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const g = useGmao();
  const canExecute = useCanExecute();
  const wo = g.workOrders.find(w => w.id === id);
  const [sub, setSub] = useState<'plan' | 'start' | 'close' | 'edit' | null>(null);
  if (!wo) return null;
  const asset = g.assetById(wo.assetId);
  const req = g.requests.find(r => r.id === wo.workRequestId);
  const checklist = g.checklists.find(c => c.id === wo.checklistId);
  const safety = g.checklists.find(c => c.id === g.settings.safetyChecklistId);
  const exec = canExecute(wo);
  const mineOnly = wo.assigneeIds.every(x => x === g.me.id);
  const canPlan = g.isResp || (g.isTech && g.settings.techniciansSelfPlan && mineOnly && exec);
  const open = OPEN_WORK_ORDER_STATUSES.includes(wo.status);

  const hold = async () => {
    const reason = await g.prompt({ title: 'Mettre en attente', message: 'Raison (attente pièce, accès, garage…)', required: true });
    if (reason) await g.run('WO_HOLD', { id: wo.id, reason }, 'Intervention mise en attente.');
  };
  const cancel = async () => {
    const reason = await g.prompt({ title: 'Annuler l’intervention', message: wo.pmPlanId ? "Motif. Cette occurrence du préventif sera sautée." : 'Motif de l’annulation.', required: true, variant: 'danger', confirmLabel: 'Annuler l’intervention' });
    if (reason) { const r = await g.run('WO_CANCEL', { id: wo.id, reason }, 'Intervention annulée.'); if (r) onClose(); }
  };
  const unplan = async () => { await g.run('WO_UNPLAN', { id: wo.id }, 'Retirée du planning.'); };

  const footer = open && !g.isClient ? (
    <>
      {g.isResp && <Button variant="danger" small icon={<XCircle size={14} />} onClick={cancel}>Annuler</Button>}
      {(g.isResp || (exec && wo.assigneeIds.includes(g.me.id))) && wo.status !== 'EN_ATTENTE' && <Button variant="secondary" small icon={<PauseCircle size={14} />} onClick={hold}>En attente</Button>}
      {g.isResp && <Button variant="secondary" small icon={<Pencil size={14} />} onClick={() => setSub('edit')}>Modifier</Button>}
      {canPlan && wo.status === 'PLANIFIE' && <Button variant="secondary" small icon={<Undo2 size={14} />} onClick={unplan}>Déplanifier</Button>}
      {canPlan && wo.status !== 'EN_COURS' && <Button variant="secondary" small icon={<CalendarClock size={14} />} onClick={() => setSub('plan')}>{wo.status === 'PLANIFIE' ? 'Replanifier' : 'Planifier'}</Button>}
      {exec && wo.status !== 'EN_COURS' && <Button variant="secondary" small icon={<Play size={14} />} onClick={() => setSub('start')}>Démarrer</Button>}
      {exec && <Button variant="success" small icon={<CheckCircle2 size={14} />} onClick={() => setSub('close')}>Réaliser</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Modal title={`${wo.number} · ${wo.assetCode}`} subtitle={wo.title} onClose={onClose} wide footer={footer}>
        <div className="flex flex-wrap gap-2 items-center">
          <WoStatusBadge s={wo.status} />
          <PriorityBadge p={wo.priority} />
          <Badge className={wo.kind === 'PREVENTIF' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}>{KIND_LABEL[wo.kind]}</Badge>
          {isLate(wo) && <Badge className="bg-danger/10 text-danger">En retard</Badge>}
          {wo.generatedAutomatically && <Badge className="bg-gray-100 text-gray-500">Générée par le préventif</Badge>}
        </div>
        {wo.holdReason && wo.status === 'EN_ATTENTE' && <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm p-3"><b>En attente :</b> {wo.holdReason}</div>}
        {wo.cancelReason && <div className="rounded-2xl bg-gray-50 text-gray-600 text-sm p-3"><b>Annulée :</b> {wo.cancelReason}</div>}
        {wo.description && <p className="text-sm text-dark whitespace-pre-wrap">{wo.description}</p>}
        {open && !g.isClient && <ContactLine asset={asset} />}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Info label="Machine"><button onClick={() => { onClose(); g.openAsset(wo.assetId); }} className="text-primary font-bold">{wo.assetCode}</button> · {wo.assetName}</Info>
          <Info label="Site">{g.siteName(wo.siteId)}</Info>
          <Info label="Type">{wo.interventionType}</Info>
          <Info label="Échéance">{fmtDate(wo.dueDate)} <span className="text-gray-400">({relativeDays(wo.dueDate)})</span></Info>
          <Info label="Planifiée">{wo.plannedStart ? `${fmtDateTime(wo.plannedStart)} → ${fmtTime(wo.plannedEnd)}` : '—'}</Info>
          <Info label={wo.resourceType === 'EXTERNE' ? 'Prestataire' : 'Intervenants'}>{wo.resourceType === 'EXTERNE' ? wo.externalProvider : wo.assigneeNames.join(', ') || 'Non attribuée'}</Info>
          {wo.clientId && <Info label="Client">{g.clientName(wo.clientId)}</Info>}
          {req && <Info label="Signalement"><button onClick={() => { onClose(); g.openRequest(req.id); }} className="text-primary font-bold">{req.number}</button> · {req.requesterName}</Info>}
          {!g.isClient && <Info label="Créée">{fmtDateTime(wo.createdAt)} · {wo.createdByName}</Info>}
        </div>
        {asset && asset.state !== 'OPERATIONNEL' && <div className="text-sm text-gray-600">Machine : <b>{STATE_LABEL[asset.state]}</b>{asset.stateReason ? ` — ${asset.stateReason}` : ''}</div>}
        {wo.procedure && !g.isClient && <div className="rounded-2xl bg-gray-50 p-4"><Label className="mb-1">Mode opératoire</Label><p className="text-sm whitespace-pre-wrap">{wo.procedure}</p></div>}
        {req?.photos?.length ? <div><Label className="mb-2">Photos du signalement</Label><PhotoStrip urls={req.photos} /></div> : null}
        {wo.safetyAnswers && safety && <div><Label className="mb-2">{safety.name}</Label><ChecklistAnswersView checklist={safety} answers={wo.safetyAnswers} /></div>}

        {wo.status === 'CLOTURE' && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-3">
            <Label>Compte rendu</Label>
            <p className="text-sm whitespace-pre-wrap text-dark">{wo.report}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Info label="Réalisée le">{g.isClient ? fmtDate(wo.actualEnd) : `${fmtDateTime(wo.actualStart)} → ${fmtTime(wo.actualEnd)}`}</Info>
              <Info label="Par">{wo.resourceType === 'EXTERNE' ? wo.externalProvider : wo.closedByName}</Info>
              {wo.meterAtClose != null && <Info label="Compteur">{fmtNum(wo.meterAtClose)} {asset?.meterType ? METER_UNIT[asset.meterType] : ''}</Info>}
            </div>
            <PhotoStrip urls={wo.photos} />
            {checklist && <ChecklistAnswersView checklist={checklist} answers={wo.checklistAnswers} />}
          </div>
        )}
      </Modal>
      {sub === 'plan' && <PlanModal wo={wo} onClose={() => setSub(null)} />}
      {sub === 'start' && <StartModal wo={wo} onClose={() => setSub(null)} />}
      {sub === 'close' && <CloseModal wo={wo} onClose={() => setSub(null)} />}
      {sub === 'edit' && <WorkOrderFormModal edit={wo} onClose={() => setSub(null)} />}
    </>
  );
};

// ─── Liste ───────────────────────────────────────────────────────────────────

type Filter = 'OPEN' | 'MINE' | 'FREE' | 'A_PLANIFIER' | 'LATE' | 'EN_ATTENTE' | 'CLOTURE' | 'ALL';

export const WoRow: React.FC<{ w: WorkOrder }> = ({ w }) => {
  const { siteName, openWorkOrder } = useGmao();
  return (
    <button onClick={() => openWorkOrder(w.id)} className="w-full text-left px-4 sm:px-5 py-3.5 border-b border-border last:border-0 hover:bg-gray-50/70 flex items-center gap-3">
      <PriorityBadge p={w.priority} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-dark">{w.assetCode}</span>
          <span className="text-sm text-dark truncate">{w.title}</span>
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {w.number} · {KIND_LABEL[w.kind]} · {siteName(w.siteId)}
          {w.plannedStart && w.status === 'PLANIFIE' ? ` · ${fmtDateTime(w.plannedStart)}` : ''}
          {w.assigneeNames.length ? ` · ${w.assigneeNames.join(', ')}` : w.externalProvider ? ` · ${w.externalProvider}` : ' · non attribuée'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <WoStatusBadge s={w.status} />
        <span className={`text-[11px] font-bold ${isLate(w) ? 'text-danger' : 'text-gray-400'}`}>{w.status === 'CLOTURE' ? fmtDate(w.closedAt) : `éch. ${relativeDays(w.dueDate)}`}</span>
      </div>
    </button>
  );
};

export const WorkOrdersView: React.FC = () => {
  const g = useGmao();
  const [filter, setFilter] = useState<Filter>(g.isTech ? 'MINE' : 'OPEN');
  const [kind, setKind] = useState<'ALL' | 'CORRECTIF' | 'PREVENTIF'>('ALL');
  const [site, setSite] = useState('');
  const [creating, setCreating] = useState(false);
  const scope = useMemo(() => g.workOrders.filter(w => !g.isTech || w.assigneeIds.includes(g.me.id) || g.mine(g.assetById(w.assetId))), [g.workOrders, g.assets]);

  const list = useMemo(() => {
    let l = scope.filter(w => (kind === 'ALL' || w.kind === kind) && (!site || w.siteId === site));
    if (filter === 'OPEN') l = l.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
    if (filter === 'MINE') l = l.filter(w => w.assigneeIds.includes(g.me.id) && OPEN_WORK_ORDER_STATUSES.includes(w.status));
    if (filter === 'FREE') l = l.filter(w => !w.assigneeIds.length && OPEN_WORK_ORDER_STATUSES.includes(w.status));
    if (filter === 'A_PLANIFIER') l = l.filter(w => w.status === 'A_PLANIFIER');
    if (filter === 'LATE') l = l.filter(isLate);
    if (filter === 'EN_ATTENTE') l = l.filter(w => w.status === 'EN_ATTENTE');
    if (filter === 'CLOTURE') l = l.filter(w => w.status === 'CLOTURE');
    const order: Record<WorkOrderStatus, number> = { EN_COURS: 0, PLANIFIE: 1, A_PLANIFIER: 2, EN_ATTENTE: 3, CLOTURE: 4, ANNULE: 5 };
    return l.sort((a, b) => filter === 'CLOTURE'
      ? (b.closedAt || '').localeCompare(a.closedAt || '')
      : order[a.status] - order[b.status] || a.priority.localeCompare(b.priority) || a.dueDate.localeCompare(b.dueDate));
  }, [scope, filter, kind, site, g.me.id]);

  const filters: { value: Filter; label: string }[] = [
    ...(g.isTech ? [{ value: 'MINE' as Filter, label: 'Les miennes' }, { value: 'FREE' as Filter, label: 'À prendre' }] : []),
    { value: 'OPEN', label: 'Ouvertes' },
    { value: 'A_PLANIFIER', label: 'À planifier' },
    { value: 'LATE', label: 'En retard' },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'CLOTURE', label: 'Réalisées' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Interventions"
        subtitle={`${scope.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status)).length} ouvertes · ${scope.filter(isLate).length} en retard`}
        actions={<>
          <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => g.navigate('suivi')}>Suivi des maintenances</Button>
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouvelle intervention</Button>
        </>}
      />
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Segmented value={filter} onChange={setFilter} options={filters} />
        <Segmented value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Toutes' }, { value: 'CORRECTIF', label: 'Curatif' }, { value: 'PREVENTIF', label: 'Préventif' }]} />
        {g.sites.length > 1 && <div className="w-44"><Select value={site} onChange={e => setSite(e.target.value)}><option value="">Tous les sites</option>{g.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>}
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty><ClipboardList className="mx-auto mb-2 text-gray-300" />Aucune intervention.</Empty> : list.map(w => <WoRow key={w.id} w={w} />)}
      </Card>
      {creating && <WorkOrderFormModal onClose={() => setCreating(false)} />}
    </div>
  );
};
