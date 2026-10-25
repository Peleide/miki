import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, GripVertical, CheckCircle2, Circle, Trash2, Play } from 'lucide-react';
import { CalendarTask, TaskKind, TASK_KIND_LABEL, WorkOrder, OPEN_WORK_ORDER_STATUSES, GmaoUser } from '../../functions/src/gmao/model';
import { useGmao } from './GmaoContext';
import {
  Badge, Button, Card, Empty, Field, fmtNum, fmtShortDate, fmtTime, Input, Label, Modal, PageHeader, PriorityBadge,
  Segmented, Select, Textarea, UserChips, relativeDays, toDateInput, WoStatusBadge,
} from './ui';
import { PlanModal, isLate } from './WorkOrdersView';

const DAY = 86400000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const overlapsDay = (startIso: string, endIso: string, day: Date) => {
  const s = new Date(startIso).getTime(), e = new Date(endIso).getTime(), d0 = day.getTime(), d1 = d0 + DAY;
  return s < d1 && e > d0;
};
/** Heures de l'élément comprises dans la journée de travail (6 h – 18 h), plafonnées à 7,5 h si l'élément dure plusieurs jours. */
const hoursInDay = (startIso: string, endIso: string, day: Date) => {
  const w0 = day.getTime() + 6 * 3600000, w1 = day.getTime() + 18 * 3600000;
  const s = Math.max(new Date(startIso).getTime(), w0);
  const e = Math.min(new Date(endIso).getTime(), w1);
  const h = Math.max(0, e - s) / 3600000;
  const multiDay = !sameDay(new Date(startIso), new Date(endIso));
  return multiDay ? Math.min(h, 7.5) : h;
};
/** Libellé horaire d'un élément pour une journée donnée (gère les interventions sur plusieurs jours). */
const timeLabel = (startIso: string, endIso: string, day?: Date) => {
  const s = new Date(startIso), e = new Date(endIso);
  if (!day || sameDay(s, e)) return `${fmtTime(startIso)}–${fmtTime(endIso)}`;
  if (sameDay(s, day)) return `${fmtTime(startIso)} →`;
  if (sameDay(e, day)) return `→ ${fmtTime(endIso)}`;
  return 'journée';
};

type Item =
  | { type: 'wo'; id: string; start: string; end: string; wo: WorkOrder }
  | { type: 'task'; id: string; start: string; end: string; task: CalendarTask };

const KIND_STYLE: Record<string, string> = {
  CORRECTIF: 'bg-primary/10 border-primary/30 text-dark',
  PREVENTIF: 'bg-teal-50 border-teal-200 text-dark',
  TACHE: 'bg-slate-50 border-slate-200 text-dark',
  REUNION: 'bg-blue-50 border-blue-200 text-dark',
  FORMATION: 'bg-purple-50 border-purple-200 text-dark',
  CONGE: 'bg-gray-100 border-gray-200 text-gray-500',
  ABSENCE: 'bg-gray-100 border-gray-200 text-gray-500',
};

// ─── Tâche ───────────────────────────────────────────────────────────────────

export const TaskModal: React.FC<{ onClose: () => void; task?: CalendarTask; defaults?: { date?: Date; userId?: string } }> = ({ onClose, task, defaults }) => {
  const { users, sites, run, isResp, isTech, canPlan, me, confirm } = useGmao();
  const people = users.filter(u => u.role !== 'CLIENT');
  const baseDate = task ? new Date(task.start) : (defaults?.date || addDays(startOfDay(new Date()), 1));
  const [f, setF] = useState({
    title: task?.title || '',
    kind: (task?.kind || 'TACHE') as TaskKind,
    assigneeIds: task?.assigneeIds || (defaults?.userId ? [defaults.userId] : isTech ? [me.id] : []),
    date: toDateInput(baseDate.toISOString()),
    endDate: toDateInput((task ? new Date(task.end) : baseDate).toISOString()),
    startTime: task ? fmtTime(task.start) : '07:00',
    endTime: task ? fmtTime(task.end) : '09:00',
    siteId: task?.siteId || '',
    notes: task?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const multiDay = f.kind === 'CONGE' || f.kind === 'ABSENCE' || f.kind === 'FORMATION';
  const ownTask = !task || task.assigneeIds.every(x => x === me.id);
  const readOnly = !(isResp || (isTech && canPlan && ownTask));

  const submit = async () => {
    setSaving(true);
    const start = new Date(`${f.date}T${f.startTime || '00:00'}`).toISOString();
    const end = new Date(`${multiDay ? f.endDate || f.date : f.date}T${f.endTime || '23:59'}`).toISOString();
    const res = await run('TASK_SAVE', { id: task?.id, title: f.title || TASK_KIND_LABEL[f.kind], kind: f.kind, assigneeIds: f.assigneeIds, start, end, siteId: f.siteId || null, notes: f.notes }, task ? 'Tâche mise à jour.' : 'Tâche ajoutée au planning.');
    setSaving(false);
    if (res) onClose();
  };
  const remove = async () => {
    if (task && await confirm({ title: 'Supprimer', message: `Supprimer « ${task.title} » du planning ?`, variant: 'danger', confirmLabel: 'Supprimer' })) {
      const r = await run('TASK_DELETE', { id: task.id }, 'Supprimé.');
      if (r) onClose();
    }
  };
  const toggleDone = async () => {
    if (!task) return;
    const r = await run('TASK_TOGGLE_DONE', { id: task.id, done: task.status !== 'FAIT' });
    if (r) onClose();
  };
  const canToggle = task && (isResp || task.assigneeIds.includes(me.id)) && task.kind === 'TACHE';

  return (
    <Modal title={task ? task.title : 'Ajouter au planning'} onClose={onClose} footer={<>
      {task && !readOnly && <Button variant="danger" small icon={<Trash2 size={14} />} onClick={remove}>Supprimer</Button>}
      {canToggle && <Button variant={task!.status === 'FAIT' ? 'secondary' : 'success'} small icon={<CheckCircle2 size={14} />} onClick={toggleDone}>{task!.status === 'FAIT' ? 'Marquer à faire' : 'Marquer fait'}</Button>}
      {!readOnly && <Button onClick={submit} loading={saving} disabled={!f.assigneeIds.length}>{task ? 'Enregistrer' : 'Ajouter'}</Button>}
    </>}>
      <fieldset disabled={readOnly} className="space-y-4">
        <Field label="Type">
          <Segmented value={f.kind} onChange={v => set('kind', v)} options={(Object.keys(TASK_KIND_LABEL) as TaskKind[]).map(k => ({ value: k, label: TASK_KIND_LABEL[k] }))} />
        </Field>
        <Field label="Intitulé"><Input value={f.title} onChange={e => set('title', e.target.value)} placeholder={f.kind === 'TACHE' ? 'Ex. : tournée des centrales, inventaire des consommables' : TASK_KIND_LABEL[f.kind]} /></Field>
        {isResp && <Field label="Personnes" required><UserChips users={people} value={f.assigneeIds} onChange={v => set('assigneeIds', v)} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={multiDay ? 'Du' : 'Date'}><Input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
          {multiDay && <Field label="Au"><Input type="date" value={f.endDate} min={f.date} onChange={e => set('endDate', e.target.value)} /></Field>}
          <Field label="Début"><Input type="time" value={f.startTime} onChange={e => set('startTime', e.target.value)} /></Field>
          <Field label="Fin"><Input type="time" value={f.endTime} onChange={e => set('endTime', e.target.value)} /></Field>
        </div>
        <Field label="Site"><Select value={f.siteId} onChange={e => set('siteId', e.target.value)}><option value="">—</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </fieldset>
    </Modal>
  );
};

// ─── Éléments du calendrier ──────────────────────────────────────────────────

function useItems(): Item[] {
  const { workOrders, tasks } = useGmao();
  return useMemo(() => [
    ...workOrders.filter(w => w.plannedStart && w.plannedEnd && w.status !== 'ANNULE')
      .map(w => ({ type: 'wo' as const, id: w.id, start: w.plannedStart!, end: w.plannedEnd!, wo: w })),
    ...tasks.map(t => ({ type: 'task' as const, id: t.id, start: t.start, end: t.end, task: t })),
  ], [workOrders, tasks]);
}

const itemUsers = (it: Item) => (it.type === 'wo' ? it.wo.assigneeIds : it.task.assigneeIds);

const ItemCard: React.FC<{ it: Item; userId?: string; day?: Date; compact?: boolean; draggable?: boolean; onOpen: () => void }> = ({ it, userId, day, compact, draggable, onOpen }) => {
  const style = it.type === 'wo' ? KIND_STYLE[it.wo.kind] : KIND_STYLE[it.task.kind];
  const done = it.type === 'wo' ? it.wo.status === 'CLOTURE' : it.task.status === 'FAIT';
  return (
    <div
      draggable={draggable && !done}
      onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ type: it.type, id: it.id, fromUser: userId })); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={e => { e.stopPropagation(); onOpen(); }}
      className={`rounded-xl border px-2 py-1.5 text-left cursor-pointer hover:shadow-sm transition-all ${style} ${done ? 'opacity-50 line-through' : ''} ${it.type === 'wo' && it.wo.status === 'EN_COURS' ? 'ring-2 ring-primary/40' : ''}`}
    >
      <div className="flex items-center gap-1 text-[10px] font-black text-gray-500">
        <span>{timeLabel(it.start, it.end, day)}</span>
        {it.type === 'wo' && <PriorityBadge p={it.wo.priority} />}
        {it.type === 'task' && it.task.kind !== 'TACHE' && <span className="uppercase tracking-wider">{TASK_KIND_LABEL[it.task.kind]}</span>}
      </div>
      <div className={`text-xs font-bold leading-tight mt-0.5 ${compact ? 'line-clamp-2' : ''}`}>
        {it.type === 'wo' ? <><span className="font-black">{it.wo.assetCode}</span> {it.wo.title}</> : it.task.title}
      </div>
      {!compact && it.type === 'wo' && <div className="mt-1 flex gap-1"><WoStatusBadge s={it.wo.status} /></div>}
    </div>
  );
};

// ─── Vue responsable : grille par technicien ─────────────────────────────────

const TeamGrid: React.FC<{ weekStart: Date; showWeekend: boolean; siteId: string }> = ({ weekStart, showWeekend, siteId }) => {
  const g = useGmao();
  const items = useItems();
  const [plan, setPlan] = useState<{ wo: WorkOrder; defaults: any } | null>(null);
  const [taskModal, setTaskModal] = useState<{ task?: CalendarTask; defaults?: any } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const days = Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i));
  const team: GmaoUser[] = g.isTech ? [g.me] : [
    ...g.users.filter(u => u.role === 'TECHNICIEN'),
    ...g.users.filter(u => u.role === 'RESPONSABLE' && (u.id === g.me.id || items.some(it => itemUsers(it).includes(u.id)))),
  ];
  const siteOk = (it: Item) => !siteId || (it.type === 'wo' ? it.wo.siteId === siteId : !it.task.siteId || it.task.siteId === siteId);

  const backlog = g.workOrders
    .filter(w => (w.status === 'A_PLANIFIER' || (w.status === 'EN_ATTENTE' && !w.plannedStart)) && (!siteId || w.siteId === siteId)
      && (!g.isTech || ((!w.assigneeIds.length || w.assigneeIds.every(x => x === g.me.id)) && g.mine(g.assetById(w.assetId)))))
    .sort((a, b) => a.priority.localeCompare(b.priority) || a.dueDate.localeCompare(b.dueDate));

  const openItem = (it: Item) => (it.type === 'wo' ? g.openWorkOrder(it.id) : setTaskModal({ task: it.task }));

  const onDrop = async (e: React.DragEvent, userId: string, day: Date) => {
    e.preventDefault();
    setDropTarget(null);
    let data: any;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    const dayItems = items.filter(it => itemUsers(it).includes(userId) && overlapsDay(it.start, it.end, day) && it.id !== data.id);
    if (data.type === 'backlog') {
      const wo = g.workOrders.find(w => w.id === data.id);
      if (!wo) return;
      const lastEnd = dayItems.reduce((m, it) => Math.max(m, new Date(it.end).getTime()), 0);
      const start = new Date(day); start.setHours(7, 0, 0, 0);
      if (lastEnd > start.getTime() && lastEnd < day.getTime() + 15 * 3600000) start.setTime(lastEnd);
      const end = new Date(start.getTime() + Math.max(1, wo.estimatedHours || 2) * 3600000);
      setPlan({ wo, defaults: { start: start.toISOString(), end: end.toISOString(), assigneeIds: [userId] } });
      return;
    }
    const it = items.find(x => x.id === data.id);
    if (!it) return;
    const oldStart = new Date(it.start), dur = new Date(it.end).getTime() - oldStart.getTime();
    const ns = new Date(day); ns.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const ne = new Date(ns.getTime() + dur);
    const ids = itemUsers(it);
    const assignees = data.fromUser && data.fromUser !== userId ? Array.from(new Set(ids.map(x => (x === data.fromUser ? userId : x)))) : ids.length ? ids : [userId];
    if (it.type === 'wo') {
      await g.run('WO_PLAN', { id: it.id, plannedStart: ns.toISOString(), plannedEnd: ne.toISOString(), assigneeIds: assignees, resourceType: it.wo.resourceType, externalProvider: it.wo.externalProvider }, `${it.wo.number} déplacé.`);
    } else {
      const t = it.task;
      await g.run('TASK_SAVE', { ...t, start: ns.toISOString(), end: ne.toISOString(), assigneeIds: assignees }, 'Tâche déplacée.');
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      <Card className="flex-1 overflow-x-auto">
        <div style={{ minWidth: 150 + days.length * 118 }}>
          <div className="grid border-b border-border" style={{ gridTemplateColumns: `150px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div className="px-4 py-3"><Label>Équipe</Label></div>
            {days.map(d => (
              <div key={d.toISOString()} className={`px-2 py-3 text-center border-l border-border ${sameDay(d, new Date()) ? 'bg-primary/5' : ''}`}>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>
                <div className={`text-sm font-black ${sameDay(d, new Date()) ? 'text-primary' : 'text-dark'}`}>{d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
              </div>
            ))}
          </div>
          {team.map(u => (
            <div key={u.id} className="grid border-b border-border last:border-0" style={{ gridTemplateColumns: `150px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="px-4 py-3">
                <div className="text-sm font-black text-dark">{u.name}</div>
                <div className="text-[11px] text-gray-400">{u.role === 'RESPONSABLE' ? 'Responsable' : 'Technicien'}</div>
              </div>
              {days.map(d => {
                const key = `${u.id}:${d.toISOString()}`;
                const cell = items.filter(it => itemUsers(it).includes(u.id) && overlapsDay(it.start, it.end, d) && siteOk(it)).sort((a, b) => a.start.localeCompare(b.start));
                const load = cell.filter(it => !(it.type === 'task' && ['CONGE', 'ABSENCE'].includes(it.task.kind))).reduce((s, it) => s + hoursInDay(it.start, it.end, d), 0);
                const off = cell.some(it => it.type === 'task' && ['CONGE', 'ABSENCE'].includes(it.task.kind));
                return (
                  <div
                    key={key}
                    data-cell={key}
                    onDragOver={e => { e.preventDefault(); setDropTarget(key); }}
                    onDragLeave={() => setDropTarget(t => (t === key ? null : t))}
                    onDrop={e => onDrop(e, u.id, d)}
                    onClick={() => setTaskModal({ defaults: { date: d, userId: u.id } })}
                    className={`group relative border-l border-border p-1.5 min-h-[96px] space-y-1 cursor-pointer ${dropTarget === key ? 'bg-primary/10' : off ? 'bg-gray-50' : sameDay(d, new Date()) ? 'bg-primary/[0.02]' : ''}`}
                  >
                    {cell.map(it => <ItemCard key={it.id} it={it} userId={u.id} day={d} compact draggable onOpen={() => openItem(it)} />)}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className={`text-[10px] font-black ${load > 8 ? 'text-danger' : 'text-gray-300'}`}>{load ? `${fmtNum(load, 1)} h` : ''}</span>
                      <Plus size={14} className="text-gray-300 opacity-0 group-hover:opacity-100" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {!team.length && <Empty>Aucun technicien. Créez les comptes dans Réglages.</Empty>}
        </div>
      </Card>

      <div className="xl:w-72 shrink-0">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1"><Label>À planifier</Label><Badge className="bg-blue-50 text-blue-600">{backlog.length}</Badge></div>
          <p className="text-[11px] text-gray-400 mb-3">{g.isTech ? 'Glissez une intervention sur un jour de votre planning, ou cliquez pour la planifier.' : 'Glissez une intervention sur un technicien et un jour, ou cliquez pour la planifier.'}</p>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {backlog.map(w => (
              <div
                key={w.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'backlog', id: w.id })); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => setPlan({ wo: w, defaults: {} })}
                className={`rounded-xl border px-3 py-2 cursor-grab active:cursor-grabbing hover:shadow-sm ${w.kind === 'PREVENTIF' ? 'border-teal-200 bg-teal-50/50' : 'border-border bg-white'}`}
              >
                <div className="flex items-center gap-1.5">
                  <GripVertical size={14} className="text-gray-300" />
                  <PriorityBadge p={w.priority} />
                  <span className="text-xs font-black text-dark">{w.assetCode}</span>
                  {w.kind === 'PREVENTIF' && <Badge className="bg-teal-100 text-teal-700">Prév.</Badge>}
                  {w.status === 'EN_ATTENTE' && <Badge className="bg-amber-100 text-amber-700">Attente</Badge>}
                </div>
                <div className="text-xs text-dark mt-1 line-clamp-2">{w.title}</div>
                <div className={`text-[10px] font-bold mt-1 ${isLate(w) ? 'text-danger' : 'text-gray-400'}`}>éch. {relativeDays(w.dueDate)} · {g.siteName(w.siteId)}{w.estimatedHours ? ` · ${fmtNum(w.estimatedHours, 1)} h` : ''}</div>
              </div>
            ))}
            {!backlog.length && <Empty>Rien à planifier.</Empty>}
          </div>
        </Card>
      </div>

      {plan && <PlanModal wo={plan.wo} defaults={plan.defaults} onClose={() => setPlan(null)} />}
      {taskModal && <TaskModal task={taskModal.task} defaults={taskModal.defaults} onClose={() => setTaskModal(null)} />}
    </div>
  );
};

// ─── Vue technicien : mon planning ───────────────────────────────────────────

const MyAgenda: React.FC<{ weekStart: Date; userId: string }> = ({ weekStart, userId }) => {
  const g = useGmao();
  const items = useItems();
  const [taskModal, setTaskModal] = useState<CalendarTask | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const toggleTask = (t: CalendarTask) => g.run('TASK_TOGGLE_DONE', { id: t.id, done: t.status !== 'FAIT' });

  const unscheduled = g.workOrders.filter(w => w.assigneeIds.includes(userId) && OPEN_WORK_ORDER_STATUSES.includes(w.status) && !w.plannedStart);

  return (
    <div className="space-y-3">
      {days.map(d => {
        const list = items.filter(it => itemUsers(it).includes(userId) && overlapsDay(it.start, it.end, d)).sort((a, b) => a.start.localeCompare(b.start));
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        if (weekend && !list.length) return null;
        const today = sameDay(d, new Date());
        return (
          <Card key={d.toISOString()} className={`p-4 ${today ? 'border-primary/40' : ''}`}>
            <div className={`text-sm font-black mb-2 capitalize ${today ? 'text-primary' : 'text-dark'}`}>
              {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{today ? " · aujourd'hui" : ''}
            </div>
            {!list.length ? <div className="text-sm text-gray-400">Rien de prévu.</div> : (
              <div className="space-y-2">
                {list.map(it => it.type === 'wo' ? (
                  <button key={it.id} onClick={() => g.openWorkOrder(it.id)} className={`w-full text-left rounded-2xl border px-3 py-2.5 flex items-center gap-3 ${KIND_STYLE[it.wo.kind]}`}>
                    <div className="text-xs font-black text-gray-500 w-20 shrink-0">{timeLabel(it.start, it.end, d)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold"><span className="font-black">{it.wo.assetCode}</span> · {it.wo.title}</div>
                      <div className="text-[11px] text-gray-500">{it.wo.number} · {g.siteName(it.wo.siteId)} · {it.wo.kind === 'PREVENTIF' ? 'Préventif' : 'Correctif'}</div>
                    </div>
                    {['PLANIFIE', 'EN_ATTENTE'].includes(it.wo.status) ? <Badge className="bg-primary text-white"><Play size={10} />Démarrer</Badge> : <WoStatusBadge s={it.wo.status} />}
                  </button>
                ) : (
                  <div key={it.id} className={`rounded-2xl border px-3 py-2.5 flex items-center gap-3 ${KIND_STYLE[it.task.kind]}`}>
                    <div className="text-xs font-black text-gray-500 w-20 shrink-0">{timeLabel(it.start, it.end, d)}</div>
                    <button onClick={() => setTaskModal(it.task)} className={`flex-1 text-left text-sm font-bold ${it.task.status === 'FAIT' ? 'line-through text-gray-400' : ''}`}>
                      {it.task.title}
                      {it.task.kind !== 'TACHE' && <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">{TASK_KIND_LABEL[it.task.kind]}</span>}
                      {it.task.notes && <div className="text-[11px] font-normal text-gray-500">{it.task.notes}</div>}
                    </button>
                    {it.task.kind === 'TACHE' && (
                      <button onClick={() => toggleTask(it.task)} aria-label="Marquer fait" className={it.task.status === 'FAIT' ? 'text-success' : 'text-gray-300 hover:text-success'}>
                        {it.task.status === 'FAIT' ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      {unscheduled.length > 0 && (
        <Card className="p-4">
          <Label className="mb-2">Interventions attribuées sans date</Label>
          {unscheduled.map(w => (
            <button key={w.id} onClick={() => g.openWorkOrder(w.id)} className="w-full text-left text-sm py-1.5 flex items-center gap-2">
              <PriorityBadge p={w.priority} /><b>{w.assetCode}</b> {w.title}
            </button>
          ))}
        </Card>
      )}
      {taskModal && <TaskModal task={taskModal} onClose={() => setTaskModal(null)} />}
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

export const PlanningView: React.FC = () => {
  const g = useGmao();
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const dow = now.getDay();
    // Le week-end, on affiche directement la semaine qui vient.
    return startOfWeek(dow === 6 || dow === 0 ? addDays(now, 2) : now);
  });
  const [showWeekend, setShowWeekend] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [mode, setMode] = useState<'equipe' | 'moi'>(g.isResp || (g.isTech && g.canPlan) ? 'equipe' : 'moi');
  const [creating, setCreating] = useState(false);
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title={mode === 'equipe' && g.isResp ? 'Planning de l’équipe' : 'Mon planning'}
        subtitle={`Semaine du ${fmtShortDate(weekStart.toISOString())} au ${fmtShortDate(weekEnd.toISOString())}`}
        actions={g.canPlan ? <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>Tâche / absence</Button> : undefined}
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-white border border-border rounded-2xl p-1">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-xl hover:bg-gray-50" aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-gray-50 flex items-center gap-1"><CalendarDays size={14} />Cette semaine</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-xl hover:bg-gray-50" aria-label="Semaine suivante"><ChevronRight size={16} /></button>
        </div>
        {g.canPlan && <Segmented value={mode} onChange={setMode} options={[{ value: 'equipe', label: g.isResp ? 'Équipe' : 'Planifier' }, { value: 'moi', label: g.isResp ? 'Mon planning' : 'Ma semaine' }]} />}
        {mode === 'equipe' && <>
          {g.sites.length > 1 && <div className="w-44"><Select value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">Tous les sites</option>{g.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>}
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500"><input type="checkbox" checked={showWeekend} onChange={e => setShowWeekend(e.target.checked)} className="accent-[#EE6E0A]" />Week-end</label>
        </>}
      </div>
      {mode === 'equipe' ? <TeamGrid weekStart={weekStart} showWeekend={showWeekend} siteId={siteId} /> : <MyAgenda weekStart={weekStart} userId={g.me.id} />}
      {creating && <TaskModal onClose={() => setCreating(false)} />}
    </div>
  );
};
