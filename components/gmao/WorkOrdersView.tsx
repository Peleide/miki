import React, { useMemo, useState } from 'react';
import { Plus, Play, CheckCircle2, PauseCircle, XCircle, CalendarClock, Pencil, ShieldCheck, Download, ClipboardList, AlertTriangle, Undo2 } from 'lucide-react';
import {
  AssetState, ChecklistAnswers, INTERVENTION_TYPES, OPEN_WORK_ORDER_STATUSES, PRIORITIES, PRIORITY_LABEL,
  WorkOrder, WorkOrderStatus, WORK_ORDER_STATUS_LABEL, METER_UNIT, STATE_LABEL,
} from '../../functions/src/gmao/model';
import { hoursBetween, workOrderCost } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, ChecklistAnswersView, ChecklistForm, downloadCsv, Empty, Field, fmtDate,
  fmtDateTime, fmtNum, fmtTime, fmtXpf, fromLocalInput, Info, Input, Label, Modal, PageHeader, PhotoInput,
  PhotoStrip, PriorityBadge, Segmented, Select, Textarea, toLocalInput, UserChips, WoStatusBadge, relativeDays,
  fromDateInput, toDateInput,
} from './ui';

const typeLabel = (c?: string) => INTERVENTION_TYPES.find(t => t.code === c)?.label || c || '—';
export const isLate = (w: WorkOrder) => OPEN_WORK_ORDER_STATUSES.includes(w.status) && new Date(w.dueDate).getTime() < Date.now();

// ─── Création / modification ─────────────────────────────────────────────────

export const WorkOrderFormModal: React.FC<{ onClose: () => void; assetId?: string; edit?: WorkOrder }> = ({ onClose, assetId: initialAsset, edit }) => {
  const { assets, siteName, run, checklists, settings, openWorkOrder } = useGmao();
  const [assetId, setAssetId] = useState(edit?.assetId || initialAsset || '');
  const [f, setF] = useState({
    kind: edit?.kind || 'CORRECTIF',
    title: edit?.title || '',
    description: edit?.description || '',
    priority: edit?.priority || 'P3',
    interventionType: edit?.interventionType || 'MECANIQUE',
    procedure: edit?.procedure || '',
    checklistId: edit?.checklistId || '',
    safetyCheckRequired: edit ? edit.safetyCheckRequired : !!settings.safetyChecklistId,
    estimatedHours: edit?.estimatedHours ?? '',
    resourceType: edit?.resourceType || 'INTERNE',
    externalProvider: edit?.externalProvider || '',
    dueDate: edit ? toDateInput(edit.dueDate) : '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    setSaving(true);
    const payload = { ...f, checklistId: f.checklistId || null, dueDate: f.dueDate ? fromDateInput(f.dueDate, 17) : undefined };
    const res = edit
      ? await run('WO_UPDATE', { id: edit.id, updates: payload }, 'Bon de travail mis à jour.')
      : await run('WO_CREATE', { ...payload, assetId }, 'Bon de travail créé.');
    setSaving(false);
    if (res) { onClose(); if (!edit && res.id) openWorkOrder(res.id); }
  };

  return (
    <Modal title={edit ? `Modifier ${edit.number}` : 'Nouveau bon de travail'} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!assetId || !f.title.trim()}>{edit ? 'Enregistrer' : 'Créer le bon de travail'}</Button>
    </>}>
      {!edit && (
        <>
          <Field label="Équipement" required><AssetPicker assets={assets} value={assetId} onChange={setAssetId} siteName={siteName} /></Field>
          <Field label="Nature"><Segmented value={f.kind as any} onChange={v => set('kind', v)} options={[{ value: 'CORRECTIF', label: 'Correctif' }, { value: 'PREVENTIF', label: 'Préventif (ponctuel)' }]} /></Field>
        </>
      )}
      <Field label="Intitulé" required><Input value={f.title} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Description"><Textarea value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Priorité">
          <Select value={f.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select>
        </Field>
        <Field label="Type d'intervention">
          <Select value={f.interventionType} onChange={e => set('interventionType', e.target.value)}>{INTERVENTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</Select>
        </Field>
        <Field label="Échéance" hint="Vide : selon la priorité.">
          <Input type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Mode opératoire" hint="Étapes, consignes de sécurité, outillage. Indicateur « interventions sans mode opératoire ».">
        <Textarea rows={4} value={f.procedure} onChange={e => set('procedure', e.target.value)} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Check-list à la clôture">
          <Select value={f.checklistId} onChange={e => set('checklistId', e.target.value)}>
            <option value="">Aucune</option>
            {checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Durée estimée (h)"><Input type="number" min={0} step={0.5} value={f.estimatedHours as any} onChange={e => set('estimatedHours', e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Ressource">
          <Segmented value={f.resourceType as any} onChange={v => set('resourceType', v)} options={[{ value: 'INTERNE', label: 'Interne' }, { value: 'EXTERNE', label: 'Prestataire' }]} />
        </Field>
        {f.resourceType === 'EXTERNE' && <Field label="Prestataire"><Input value={f.externalProvider} onChange={e => set('externalProvider', e.target.value)} /></Field>}
      </div>
      {settings.safetyChecklistId && (
        <label className="flex items-center gap-2 text-sm font-semibold text-dark">
          <input type="checkbox" checked={f.safetyCheckRequired} onChange={e => set('safetyCheckRequired', e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
          Take 5 obligatoire avant de démarrer
        </label>
      )}
    </Modal>
  );
};

// ─── Planification ───────────────────────────────────────────────────────────

export const PlanModal: React.FC<{ wo: WorkOrder; onClose: () => void; defaults?: { start?: string; end?: string; assigneeIds?: string[] } }> = ({ wo, onClose, defaults }) => {
  const { users, run } = useGmao();
  const techs = users.filter(u => u.role !== 'DEMANDEUR');
  const defaultStart = defaults?.start || wo.plannedStart || (() => { const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); d.setHours(7, 0, 0, 0); return d.toISOString(); })();
  const defaultEnd = defaults?.end || wo.plannedEnd || new Date(new Date(defaultStart).getTime() + Math.max(1, wo.estimatedHours || 2) * 3600000).toISOString();
  const [start, setStart] = useState(toLocalInput(defaultStart));
  const [end, setEnd] = useState(toLocalInput(defaultEnd));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaults?.assigneeIds || wo.assigneeIds || []);
  const [resourceType, setResourceType] = useState(wo.resourceType);
  const [externalProvider, setExternalProvider] = useState(wo.externalProvider || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const res = await run('WO_PLAN', { id: wo.id, plannedStart: fromLocalInput(start), plannedEnd: fromLocalInput(end), assigneeIds, resourceType, externalProvider }, 'Bon de travail planifié.');
    setSaving(false);
    if (res) onClose();
  };

  return (
    <Modal title={`Planifier ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} icon={<CalendarClock size={16} />}>Planifier</Button>
    </>}>
      <Field label="Ressource">
        <Segmented value={resourceType} onChange={setResourceType} options={[{ value: 'INTERNE', label: 'Équipe interne' }, { value: 'EXTERNE', label: 'Prestataire' }]} />
      </Field>
      {resourceType === 'EXTERNE' && <Field label="Prestataire" required><Input value={externalProvider} onChange={e => setExternalProvider(e.target.value)} /></Field>}
      <Field label={resourceType === 'INTERNE' ? 'Techniciens' : 'Suivi interne (facultatif)'} required={resourceType === 'INTERNE'}>
        <UserChips users={techs} value={assigneeIds} onChange={setAssigneeIds} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début"><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Fin"><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      <div className="text-xs text-gray-500">Échéance : {fmtDate(wo.dueDate)} ({relativeDays(wo.dueDate)}){wo.estimatedHours ? ` · durée estimée ${fmtNum(wo.estimatedHours, 1)} h` : ''}</div>
    </Modal>
  );
};

// ─── Démarrage (Take 5) ──────────────────────────────────────────────────────

const StartModal: React.FC<{ wo: WorkOrder; onClose: () => void }> = ({ wo, onClose }) => {
  const { settings, checklists, run, backend } = useGmao();
  const safety = wo.safetyCheckRequired ? checklists.find(c => c.id === settings.safetyChecklistId) : undefined;
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [immobilize, setImmobilize] = useState(false);
  const [saving, setSaving] = useState(false);
  const blocked = safety?.items.some(i => i.type === 'BOOLEAN' && i.required && answers[i.id]?.value === false);

  const submit = async () => {
    setSaving(true);
    const res = await run('WO_START', { id: wo.id, safetyAnswers: safety ? answers : undefined, immobilize }, 'Intervention démarrée.');
    setSaving(false);
    if (res) onClose();
  };

  return (
    <Modal title={`Démarrer ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!!blocked} icon={<Play size={16} />}>Démarrer l'intervention</Button>
    </>}>
      {wo.procedure && (
        <div className="rounded-2xl bg-gray-50 p-4">
          <Label className="mb-1">Mode opératoire</Label>
          <p className="text-sm whitespace-pre-wrap text-dark">{wo.procedure}</p>
        </div>
      )}
      {safety ? (
        <>
          <div className="flex items-center gap-2 text-sm font-black text-dark"><ShieldCheck size={18} className="text-primary" />{safety.name}</div>
          <ChecklistForm checklist={safety} value={answers} onChange={setAnswers} upload={f => backend.upload(`workOrders/${wo.id}`, f)} safety />
          {blocked && (
            <div className="rounded-2xl bg-danger/10 text-danger text-sm font-bold p-3 flex gap-2"><AlertTriangle size={18} className="shrink-0" />Un point de sécurité n'est pas validé : ne démarrez pas, prévenez le responsable.</div>
          )}
        </>
      ) : <p className="text-sm text-gray-500">Pas d'analyse de sécurité exigée pour ce bon de travail.</p>}
      <label className="flex items-center gap-2 text-sm font-semibold text-dark">
        <input type="checkbox" checked={immobilize} onChange={e => setImmobilize(e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
        Immobiliser la machine pendant l'intervention (état « indisponible »)
      </label>
    </Modal>
  );
};

// ─── Clôture ─────────────────────────────────────────────────────────────────

const CloseModal: React.FC<{ wo: WorkOrder; onClose: () => void }> = ({ wo, onClose }) => {
  const { checklists, run, backend, assetById, settings } = useGmao();
  const asset = assetById(wo.assetId);
  const checklist = checklists.find(c => c.id === wo.checklistId);
  const now = new Date();
  const [report, setReport] = useState('');
  const defaultStart = (() => {
    const limit = now.getTime() - 5 * 60000;
    if (wo.startedAt && new Date(wo.startedAt).getTime() < limit) return wo.startedAt;
    if (wo.plannedStart && new Date(wo.plannedStart).getTime() < limit) return wo.plannedStart;
    return new Date(now.getTime() - Math.max(0.5, wo.estimatedHours || 1) * 3600000).toISOString();
  })();
  const [start, setStart] = useState(toLocalInput(defaultStart));
  const [end, setEnd] = useState(toLocalInput(now.toISOString()));
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [partsCost, setPartsCost] = useState('');
  const [externalCost, setExternalCost] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [meter, setMeter] = useState('');
  const [state, setState] = useState<AssetState>('OPERATIONNEL');
  const [stateReason, setStateReason] = useState('');
  const [saving, setSaving] = useState(false);

  const autoHours = hoursBetween(fromLocalInput(start), fromLocalInput(end)) * Math.max(1, wo.assigneeIds.length || 1);

  const submit = async () => {
    setSaving(true);
    const res = await run('WO_CLOSE', {
      id: wo.id, report, actualStart: fromLocalInput(start), actualEnd: fromLocalInput(end),
      checklistAnswers: checklist ? answers : undefined, photos,
      partsCost, externalCost, laborHours: laborHours || undefined,
      meterAtClose: meter || undefined, assetStateAfter: state, assetStateReason: stateReason,
    }, 'Bon de travail clôturé.');
    setSaving(false);
    if (res) onClose();
  };

  return (
    <Modal title={`Clôturer ${wo.number}`} subtitle={`${wo.assetCode} · ${wo.title}`} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button variant="success" onClick={submit} loading={saving} disabled={!report.trim()} icon={<CheckCircle2 size={16} />}>Clôturer</Button>
    </>}>
      <Field label="Rapport d'intervention" required hint="Ce qui a été constaté et fait, pièces changées, points à surveiller.">
        <Textarea rows={4} value={report} onChange={e => setReport(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début réel"><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Fin réelle"><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      {checklist && (
        <div>
          <Label className="mb-2">{checklist.name}</Label>
          <ChecklistForm checklist={checklist} value={answers} onChange={setAnswers} upload={f => backend.upload(`workOrders/${wo.id}`, f)} />
        </div>
      )}
      <Field label="Photos"><PhotoInput value={photos} onChange={setPhotos} upload={f => backend.upload(`workOrders/${wo.id}`, f)} /></Field>
      {asset?.meterType && (
        <Field label={`Relevé compteur (${METER_UNIT[asset.meterType]})`} hint={`Dernier relevé : ${fmtNum(asset.meterValue)} ${METER_UNIT[asset.meterType]}`}>
          <Input type="number" inputMode="numeric" value={meter} onChange={e => setMeter(e.target.value)} />
        </Field>
      )}
      <Field label="État de la machine après intervention">
        <Segmented value={state} onChange={setState} options={[{ value: 'OPERATIONNEL', label: 'Opérationnelle' }, { value: 'DEGRADE', label: 'Mode dégradé' }, { value: 'INDISPONIBLE', label: 'Toujours à l\'arrêt' }]} />
      </Field>
      {state !== 'OPERATIONNEL' && <Field label="Motif"><Input value={stateReason} onChange={e => setStateReason(e.target.value)} placeholder="Ex. : attente pièce" /></Field>}
      <div className="rounded-2xl border border-border p-4">
        <Label className="mb-3">Coûts</Label>
        <div className="grid sm:grid-cols-3 gap-3">
          {wo.resourceType === 'INTERNE' && (
            <Field label="Main d'œuvre (h)" hint={`Calcul auto : ${fmtNum(autoHours, 2)} h${settings.hourlyRate ? ` × ${fmtXpf(settings.hourlyRate)}` : ''}`}>
              <Input type="number" min={0} step={0.25} value={laborHours} onChange={e => setLaborHours(e.target.value)} placeholder={fmtNum(autoHours, 2)} />
            </Field>
          )}
          <Field label="Pièces (XPF)"><Input type="number" min={0} value={partsCost} onChange={e => setPartsCost(e.target.value)} /></Field>
          <Field label="Prestataire (XPF)"><Input type="number" min={0} value={externalCost} onChange={e => setExternalCost(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
};

// ─── Détail ──────────────────────────────────────────────────────────────────

export const WorkOrderDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const g = useGmao();
  const wo = g.workOrders.find(w => w.id === id);
  const [sub, setSub] = useState<'plan' | 'start' | 'close' | 'edit' | null>(null);
  if (!wo) return null;
  const asset = g.assetById(wo.assetId);
  const req = g.requests.find(r => r.id === wo.workRequestId);
  const checklist = g.checklists.find(c => c.id === wo.checklistId);
  const safety = g.checklists.find(c => c.id === g.settings.safetyChecklistId);
  const mine = wo.assigneeIds.includes(g.me.id);
  const canExecute = g.isResp || (g.isTech && mine);
  const open = OPEN_WORK_ORDER_STATUSES.includes(wo.status);
  const cost = workOrderCost(wo, g.settings.hourlyRate);

  const hold = async () => {
    const reason = await g.prompt({ title: 'Mettre en attente', message: 'Raison (attente pièce, météo, accès…)', required: true });
    if (reason) await g.run('WO_HOLD', { id: wo.id, reason }, 'Bon de travail mis en attente.');
  };
  const cancel = async () => {
    const reason = await g.prompt({ title: 'Annuler le bon de travail', message: wo.pmPlanId ? "Motif. L'occurrence préventive sera sautée (alerte refusée)." : 'Motif de l\'annulation.', required: true, variant: 'danger', confirmLabel: 'Annuler le BT' });
    if (reason) { const r = await g.run('WO_CANCEL', { id: wo.id, reason }, 'Bon de travail annulé.'); if (r) onClose(); }
  };
  const unplan = async () => { await g.run('WO_UNPLAN', { id: wo.id }, 'Retiré du planning.'); };

  const footer = open ? (
    <>
      {g.isResp && <Button variant="danger" small icon={<XCircle size={14} />} onClick={cancel}>Annuler</Button>}
      {g.isResp && wo.status !== 'EN_ATTENTE' && <Button variant="secondary" small icon={<PauseCircle size={14} />} onClick={hold}>En attente</Button>}
      {g.isResp && <Button variant="secondary" small icon={<Pencil size={14} />} onClick={() => setSub('edit')}>Modifier</Button>}
      {g.isResp && wo.status === 'PLANIFIE' && <Button variant="secondary" small icon={<Undo2 size={14} />} onClick={unplan}>Déplanifier</Button>}
      {g.isResp && wo.status !== 'EN_COURS' && <Button variant="secondary" small icon={<CalendarClock size={14} />} onClick={() => setSub('plan')}>{wo.status === 'PLANIFIE' ? 'Replanifier' : 'Planifier'}</Button>}
      {canExecute && wo.status !== 'EN_COURS' && <Button small icon={<Play size={14} />} onClick={() => setSub('start')}>Démarrer</Button>}
      {canExecute && <Button variant="success" small icon={<CheckCircle2 size={14} />} onClick={() => setSub('close')}>Clôturer</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Modal title={`${wo.number} · ${wo.assetCode}`} subtitle={wo.title} onClose={onClose} wide footer={footer}>
        <div className="flex flex-wrap gap-2 items-center">
          <WoStatusBadge s={wo.status} />
          <PriorityBadge p={wo.priority} />
          <Badge className={wo.kind === 'PREVENTIF' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}>{wo.kind === 'PREVENTIF' ? 'Préventif' : 'Correctif'}</Badge>
          {isLate(wo) && <Badge className="bg-danger/10 text-danger">En retard</Badge>}
          {wo.generatedAutomatically && <Badge className="bg-gray-100 text-gray-500">Notifié automatiquement</Badge>}
        </div>
        {wo.holdReason && wo.status === 'EN_ATTENTE' && <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm p-3"><b>En attente :</b> {wo.holdReason}</div>}
        {wo.cancelReason && <div className="rounded-2xl bg-gray-50 text-gray-600 text-sm p-3"><b>Annulé :</b> {wo.cancelReason}</div>}
        {wo.description && <p className="text-sm text-dark whitespace-pre-wrap">{wo.description}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Info label="Équipement"><button onClick={() => { onClose(); g.openAsset(wo.assetId); }} className="text-primary font-bold">{wo.assetCode}</button> · {wo.assetName}</Info>
          <Info label="Site">{g.siteName(wo.siteId)}</Info>
          <Info label="Type">{typeLabel(wo.interventionType)}</Info>
          <Info label="Échéance">{fmtDate(wo.dueDate)} <span className="text-gray-400">({relativeDays(wo.dueDate)})</span></Info>
          <Info label="Planifié">{wo.plannedStart ? `${fmtDateTime(wo.plannedStart)} → ${fmtTime(wo.plannedEnd)}` : '—'}</Info>
          <Info label={wo.resourceType === 'EXTERNE' ? 'Prestataire' : 'Intervenants'}>{wo.resourceType === 'EXTERNE' ? wo.externalProvider : wo.assigneeNames.join(', ')}</Info>
          {wo.estimatedHours ? <Info label="Durée estimée">{fmtNum(wo.estimatedHours, 1)} h</Info> : null}
          {req && <Info label="Demande"><button onClick={() => { onClose(); g.openRequest(req.id); }} className="text-primary font-bold">{req.number}</button> · {req.requesterName}</Info>}
          <Info label="Créé">{fmtDateTime(wo.createdAt)} · {wo.createdByName}</Info>
        </div>
        {asset && asset.state !== 'OPERATIONNEL' && (
          <div className="text-sm text-gray-600">Machine : <b>{STATE_LABEL[asset.state]}</b>{asset.stateReason ? ` — ${asset.stateReason}` : ''}</div>
        )}
        {wo.procedure ? (
          <div className="rounded-2xl bg-gray-50 p-4"><Label className="mb-1">Mode opératoire</Label><p className="text-sm whitespace-pre-wrap">{wo.procedure}</p></div>
        ) : open && <div className="text-xs text-gray-400">Pas de mode opératoire renseigné.</div>}
        {req?.photos?.length ? <div><Label className="mb-2">Photos de la demande</Label><PhotoStrip urls={req.photos} /></div> : null}

        {wo.startedAt && <Info label="Démarré">{fmtDateTime(wo.startedAt)} · {wo.startedByName}</Info>}
        {wo.safetyAnswers && safety && <div><Label className="mb-2">{safety.name}</Label><ChecklistAnswersView checklist={safety} answers={wo.safetyAnswers} /></div>}

        {wo.status === 'CLOTURE' && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-3">
            <Label>Rapport d'intervention</Label>
            <p className="text-sm whitespace-pre-wrap text-dark">{wo.report}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Info label="Réalisé">{fmtDateTime(wo.actualStart)} → {fmtTime(wo.actualEnd)}</Info>
              <Info label="Clôturé par">{wo.closedByName}</Info>
              <Info label="Main d'œuvre">{fmtNum(wo.laborHours, 2)} h</Info>
              <Info label="Coût total">{fmtXpf(cost.total)}</Info>
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

type Filter = 'OPEN' | 'MINE' | 'A_PLANIFIER' | 'LATE' | 'EN_ATTENTE' | 'CLOTURE' | 'ALL';

export const WorkOrdersView: React.FC = () => {
  const { workOrders, isResp, isTech, me, siteName, sites, openWorkOrder, settings } = useGmao();
  const [filter, setFilter] = useState<Filter>(isTech ? 'MINE' : 'OPEN');
  const [kind, setKind] = useState<'ALL' | 'CORRECTIF' | 'PREVENTIF'>('ALL');
  const [site, setSite] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    let l = workOrders.filter(w => (kind === 'ALL' || w.kind === kind) && (!site || w.siteId === site));
    if (filter === 'OPEN') l = l.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
    if (filter === 'MINE') l = l.filter(w => w.assigneeIds.includes(me.id) && OPEN_WORK_ORDER_STATUSES.includes(w.status));
    if (filter === 'A_PLANIFIER') l = l.filter(w => w.status === 'A_PLANIFIER');
    if (filter === 'LATE') l = l.filter(isLate);
    if (filter === 'EN_ATTENTE') l = l.filter(w => w.status === 'EN_ATTENTE');
    if (filter === 'CLOTURE') l = l.filter(w => w.status === 'CLOTURE');
    const order: Record<WorkOrderStatus, number> = { EN_COURS: 0, PLANIFIE: 1, A_PLANIFIER: 2, EN_ATTENTE: 3, CLOTURE: 4, ANNULE: 5 };
    return l.sort((a, b) => filter === 'CLOTURE'
      ? (b.closedAt || '').localeCompare(a.closedAt || '')
      : order[a.status] - order[b.status] || a.priority.localeCompare(b.priority) || a.dueDate.localeCompare(b.dueDate));
  }, [workOrders, filter, kind, site, me.id]);

  const exportCsv = () => {
    downloadCsv(`bons-de-travail-${new Date().toISOString().slice(0, 10)}.csv`,
      ['N°', 'Nature', 'Statut', 'Priorité', 'Équipement', 'Désignation', 'Site', 'Intitulé', 'Type', 'Échéance', 'Planifié', 'Intervenants', 'Début réel', 'Fin réelle', 'Main d\'œuvre (h)', 'Pièces (XPF)', 'Prestataire (XPF)', 'Coût total (XPF)', 'Mode opératoire', 'Rapport'],
      list.map(w => {
        const c = workOrderCost(w, settings.hourlyRate);
        return [w.number, w.kind, WORK_ORDER_STATUS_LABEL[w.status], w.priority, w.assetCode, w.assetName, siteName(w.siteId), w.title, typeLabel(w.interventionType), fmtDate(w.dueDate), fmtDateTime(w.plannedStart), w.resourceType === 'EXTERNE' ? w.externalProvider : w.assigneeNames.join(', '), fmtDateTime(w.actualStart), fmtDateTime(w.actualEnd), w.laborHours ?? '', w.partsCost ?? '', w.externalCost ?? '', w.status === 'CLOTURE' ? Math.round(c.total) : '', w.procedure ? 'oui' : 'non', w.report || ''];
      }));
  };

  const filters: { value: Filter; label: string }[] = [
    ...(isTech ? [{ value: 'MINE' as Filter, label: 'Mes BT' }] : []),
    { value: 'OPEN', label: 'Ouverts' },
    { value: 'A_PLANIFIER', label: 'À planifier' },
    { value: 'LATE', label: 'En retard' },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'CLOTURE', label: 'Clôturés' },
    { value: 'ALL', label: 'Tous' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Bons de travail"
        subtitle={`${workOrders.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status)).length} ouverts · ${workOrders.filter(isLate).length} en retard`}
        actions={<>
          {isResp && <Button variant="secondary" icon={<Download size={16} />} onClick={exportCsv}>Export CSV</Button>}
          {isResp && <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nouveau BT</Button>}
        </>}
      />
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Segmented value={filter} onChange={setFilter} options={filters} />
        <Segmented value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Tous types' }, { value: 'CORRECTIF', label: 'Correctif' }, { value: 'PREVENTIF', label: 'Préventif' }]} />
        <div className="w-44"><Select value={site} onChange={e => setSite(e.target.value)}><option value="">Tous les sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? <Empty><ClipboardList className="mx-auto mb-2 text-gray-300" />Aucun bon de travail.</Empty> : list.map(w => (
          <button key={w.id} onClick={() => openWorkOrder(w.id)} className="w-full text-left px-4 sm:px-5 py-3.5 border-b border-border last:border-0 hover:bg-gray-50/70 flex items-center gap-3">
            <PriorityBadge p={w.priority} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-dark">{w.assetCode}</span>
                <span className="text-sm text-dark truncate">{w.title}</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {w.number} · {w.kind === 'PREVENTIF' ? 'Préventif' : 'Correctif'} · {siteName(w.siteId)}
                {w.plannedStart && w.status === 'PLANIFIE' ? ` · ${fmtDateTime(w.plannedStart)}` : ''}
                {w.assigneeNames.length ? ` · ${w.assigneeNames.join(', ')}` : w.externalProvider ? ` · ${w.externalProvider}` : ''}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <WoStatusBadge s={w.status} />
              <span className={`text-[11px] font-bold ${isLate(w) ? 'text-danger' : 'text-gray-400'}`}>{w.status === 'CLOTURE' ? fmtDate(w.closedAt) : `éch. ${relativeDays(w.dueDate)}`}</span>
            </div>
          </button>
        ))}
      </Card>
      {creating && <WorkOrderFormModal onClose={() => setCreating(false)} />}
    </div>
  );
};
