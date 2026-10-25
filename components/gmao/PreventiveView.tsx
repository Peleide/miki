import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Pencil, Power, Archive, CalendarRange, ListChecks, AlertTriangle, Layers } from 'lucide-react';
import {
  Asset, METER_UNIT, PmPlan, PRIORITIES, Recurrence, RecurrenceFreq, OPEN_WORK_ORDER_STATUSES, priorityLabel,
} from '../../functions/src/gmao/model';
import { isPmOverdue } from '../../functions/src/gmao/rules';
import {
  addPeriod, civilOf, describeRecurrence, nextOccurrence, normalizeRecurrence, nthOf, occurrences, weekdayOf, WEEKDAY_LONG,
} from '../../functions/src/gmao/recurrence';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, Empty, Field, fmtDate, fmtNum, fmtPct, Input, Kpi, Label, Modal,
  PageHeader, Segmented, Select, Textarea, relativeDays, WoStatusBadge,
} from './ui';

const OFFSET = 660;
const todayCivil = () => civilOf(new Date(), OFFSET);
const fmtCivil = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const ORD = (n: number) => (n === -1 ? 'dernier' : n === 1 ? '1er' : `${n}e`);
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ─── Éditeur de récurrence ───────────────────────────────────────────────────

const RecurrenceEditor: React.FC<{ rule: Recurrence; start: string; onRule: (r: Recurrence) => void; onStart: (d: string) => void; startLocked?: boolean }> = ({ rule, start, onRule, onStart, startLocked }) => {
  const set = (patch: Partial<Recurrence>) => onRule(normalizeRecurrence({ ...rule, ...patch }));
  const preview = useMemo(() => {
    const out: string[] = [];
    if (!start) return out;
    if (rule.anchor === 'REALISATION') {
      let d = start;
      for (let i = 0; i < 4; i++) { out.push(d); d = addPeriod(d, rule); }
      return out;
    }
    for (const o of occurrences(rule, start)) { out.push(o.date); if (out.length >= 4) break; }
    return out;
  }, [rule, start]);
  const unitLabel: Record<RecurrenceFreq, string> = { DAILY: 'jour(s)', WEEKLY: 'semaine(s)', MONTHLY: 'mois', YEARLY: 'an(s)' };

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Première échéance" hint={startLocked ? 'Modifier la date recalcule les échéances.' : undefined}>
          <Input type="date" value={start} onChange={e => onStart(e.target.value)} />
        </Field>
        <Field label="Répéter tous les">
          <div className="flex gap-2">
            <Input type="number" min={1} className="w-20" value={rule.interval} onChange={e => set({ interval: Number(e.target.value) || 1 })} />
            <Select value={rule.freq} onChange={e => set({ freq: e.target.value as RecurrenceFreq, byWeekday: e.target.value === 'WEEKLY' && start ? [weekdayOf(start)] : undefined })}>
              {(Object.keys(unitLabel) as RecurrenceFreq[]).map(f => <option key={f} value={f}>{unitLabel[f]}</option>)}
            </Select>
          </div>
        </Field>
        {rule.freq === 'MONTHLY' && start && (
          <Field label="Chaque mois">
            <Select value={rule.monthlyMode || 'DAY'} onChange={e => set({ monthlyMode: e.target.value as any })}>
              <option value="DAY">le {Number(start.slice(8, 10)) === 1 ? '1er' : Number(start.slice(8, 10))}</option>
              <option value="NTH_WEEKDAY">le {ORD(nthOf(start))} {WEEKDAY_LONG[weekdayOf(start)]}</option>
            </Select>
          </Field>
        )}
      </div>
      {rule.freq === 'WEEKLY' && (
        <Field label="Le">
          <div className="flex gap-1.5">
            {WD.map((l, i) => {
              const on = (rule.byWeekday || []).includes(i);
              return <button type="button" key={i} aria-label={WEEKDAY_LONG[i]} onClick={() => { const cur = rule.byWeekday || []; const next = on ? cur.filter(x => x !== i) : [...cur, i]; set({ byWeekday: next.length ? next : cur }); }}
                className={`w-9 h-9 rounded-full text-xs font-black ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>{l}</button>;
            })}
          </div>
        </Field>
      )}
      <Field label="Fin">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={rule.end.type} onChange={v => set({ end: v === 'UNTIL' ? { type: 'UNTIL', until: rule.end.until || addPeriod(start || todayCivil(), { freq: 'YEARLY', interval: 1 }) } : v === 'COUNT' ? { type: 'COUNT', count: rule.end.count || 10 } : { type: 'NEVER' } })}
            options={[{ value: 'NEVER', label: 'Jamais' }, { value: 'UNTIL', label: 'Le' }, { value: 'COUNT', label: 'Après' }]} />
          {rule.end.type === 'UNTIL' && <Input type="date" className="w-44" value={rule.end.until || ''} onChange={e => set({ end: { type: 'UNTIL', until: e.target.value } })} />}
          {rule.end.type === 'COUNT' && <span className="flex items-center gap-2"><Input type="number" min={1} className="w-20" value={rule.end.count || 1} onChange={e => set({ end: { type: 'COUNT', count: Number(e.target.value) || 1 } })} /><span className="text-sm text-gray-500">fois</span></span>}
        </div>
      </Field>
      <Field label="Si une maintenance est faite en retard">
        <Segmented value={rule.anchor} onChange={v => set({ anchor: v })} options={[
          { value: 'CALENDRIER', label: 'Garder les dates prévues' },
          { value: 'REALISATION', label: 'Repartir de la date de réalisation' },
        ]} />
      </Field>
      <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <b className="text-dark">{describeRecurrence(rule, start)}</b>
        {preview.length > 0 && <div className="mt-1">Prochaines : {preview.map(fmtCivil).join(' · ')}{rule.anchor === 'REALISATION' ? ' (si réalisées à la date)' : ''}</div>}
        <div className="mt-1 text-gray-400">Une échéance manquée n’est jamais rattrapée : une seule intervention reste ouverte jusqu’à sa réalisation.</div>
      </div>
    </div>
  );
};

// ─── Formulaire de gamme ─────────────────────────────────────────────────────

const PlanFormModal: React.FC<{ onClose: () => void; edit?: PmPlan }> = ({ onClose, edit }) => {
  const g = useGmao();
  const defaultRule: Recurrence = { freq: 'MONTHLY', interval: 1, monthlyMode: 'DAY', end: { type: 'NEVER' }, anchor: 'CALENDRIER' };
  const firstEntry = edit ? (Object.values(edit.schedule || {})[0] as PmPlan['schedule'][string] | undefined) : undefined;
  const [f, setF] = useState({
    name: edit?.name || '',
    trigger: edit?.trigger || 'CALENDAIRE',
    meterInterval: edit?.meterInterval ?? 10000,
    meterAnchor: edit?.meterAnchor || 'REALISATION',
    alertBefore: edit?.alertBefore ?? 7,
    interventionType: edit?.interventionType || g.settings.interventionTypes[0],
    priority: edit?.priority || 'P3',
    procedure: edit?.procedure || '',
    checklistId: edit?.checklistId || '',
    consumables: edit?.consumables || '',
    estimatedHours: edit?.estimatedHours ?? '',
    safetyCheckRequired: edit ? edit.safetyCheckRequired : !!g.settings.safetyChecklistId,
    typologyId: edit?.typologyId || '',
    firstMeter: '',
  });
  const [rule, setRule] = useState<Recurrence>(edit?.recurrence || defaultRule);
  const [start, setStart] = useState(firstEntry?.startDate || todayCivil());
  const [startTouched, setStartTouched] = useState(false);
  const [assetIds, setAssetIds] = useState<string[]>(edit?.assetIds || []);
  const [picker, setPicker] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const selected = assetIds.map(id => g.assetById(id)).filter(Boolean) as Asset[];
  const counterIssue = f.trigger === 'COMPTEUR' && selected.some(a => !a.meterType);
  const typAssets = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT' && a.typologyId && a.typologyId === f.typologyId && !assetIds.includes(a.id) && (f.trigger !== 'COMPTEUR' || a.meterType));

  const addAsset = (id: string) => { if (id && !assetIds.includes(id)) setAssetIds([...assetIds, id]); setPicker(''); };
  const submit = async () => {
    setSaving(true);
    const res = await g.run('PM_SAVE', {
      ...f, id: edit?.id, assetIds, checklistId: f.checklistId || null, typologyId: f.typologyId || null,
      recurrence: f.trigger === 'CALENDAIRE' ? rule : null,
      firstDate: f.trigger === 'CALENDAIRE' && (!edit || startTouched) ? start : null,
      firstMeter: f.trigger === 'COMPTEUR' && f.firstMeter ? f.firstMeter : null,
    }, edit ? 'Gamme mise à jour.' : 'Gamme créée.');
    setSaving(false);
    if (res) {
      if (res.generatedWorkOrders?.length) g.toast(`${res.generatedWorkOrders.length} intervention(s) déjà à prévoir créée(s).`, 'info');
      onClose();
    }
  };

  return (
    <Modal wide title={edit ? `Modifier « ${edit.name} »` : 'Nouvelle gamme préventive'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!f.name.trim() || (!assetIds.length && !f.typologyId) || counterIssue}>{edit ? 'Enregistrer' : 'Créer la gamme'}</Button>
    </>}>
      <Field label="Nom" required><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex. : Vidange, inversion des bavettes, visite périodique…" /></Field>
      <Field label="Déclenchement">
        <Segmented value={f.trigger as any} onChange={v => set('trigger', v)} options={[{ value: 'CALENDAIRE', label: 'Calendrier (récurrence)' }, { value: 'COMPTEUR', label: 'Compteur (km / heures)' }]} />
      </Field>
      {f.trigger === 'CALENDAIRE' ? (
        <RecurrenceEditor rule={rule} start={start} onRule={setRule} onStart={d => { setStart(d); setStartTouched(true); }} startLocked={!!edit} />
      ) : (
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Tous les (km ou h)"><Input type="number" min={1} value={f.meterInterval as any} onChange={e => set('meterInterval', e.target.value)} /></Field>
            <Field label="Première échéance (facultatif)" hint="Vide : compteur actuel + intervalle."><Input type="number" min={0} value={f.firstMeter} onChange={e => set('firstMeter', e.target.value)} /></Field>
          </div>
          <Field label="Après une réalisation">
            <Segmented value={f.meterAnchor as any} onChange={v => set('meterAnchor', v)} options={[{ value: 'REALISATION', label: 'Repartir du relevé du jour' }, { value: 'FIXE', label: 'Paliers fixes (10 000, 20 000…)' }]} />
          </Field>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={f.trigger === 'CALENDAIRE' ? 'Prévenir (jours avant)' : 'Prévenir (km / h avant)'} hint="L’intervention apparaît « à faire » à ce moment-là.">
          <Input type="number" min={0} value={f.alertBefore} onChange={e => set('alertBefore', e.target.value)} />
        </Field>
        <Field label="Priorité"><Select value={f.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p, g.settings.priorityDelays)}</option>)}</Select></Field>
        <Field label="Durée estimée (h)"><Input type="number" min={0} step={0.25} value={f.estimatedHours as any} onChange={e => set('estimatedHours', e.target.value)} /></Field>
      </div>

      <Field label="Typologie (gamme type)" hint="Les nouvelles machines de cette typologie recevront automatiquement cette gamme.">
        <Select value={f.typologyId} onChange={e => set('typologyId', e.target.value)}>
          <option value="">Aucune</option>{g.typologies.filter(t => !t.isArchived).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Machines">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {selected.map(a => (
              <Badge key={a.id} className={`${f.trigger === 'COMPTEUR' && !a.meterType ? 'bg-danger/10 text-danger' : 'bg-gray-100 text-dark'} normal-case tracking-normal text-xs`}>
                {a.code} · {a.name}
                <button type="button" onClick={() => setAssetIds(assetIds.filter(x => x !== a.id))} className="ml-1 text-gray-400 hover:text-danger" aria-label={`Retirer ${a.code}`}>×</button>
              </Badge>
            ))}
          </div>
          {typAssets.length > 0 && <Button small variant="secondary" icon={<Layers size={14} />} onClick={() => setAssetIds([...assetIds, ...typAssets.map(a => a.id)])}>Ajouter les {typAssets.length} machine(s) de la typologie</Button>}
          <AssetPicker assets={g.assets.filter(a => !assetIds.includes(a.id) && (f.trigger !== 'COMPTEUR' || a.meterType))} value={picker} onChange={addAsset} siteName={g.siteName} />
          {counterIssue && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle size={12} />Certaines machines n'ont pas de compteur.</p>}
        </div>
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Type d'intervention"><Select value={f.interventionType} onChange={e => set('interventionType', e.target.value)}>{Array.from(new Set([...g.settings.interventionTypes, f.interventionType])).map(t => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <Field label="Check-list">
          <Select value={f.checklistId} onChange={e => set('checklistId', e.target.value)}>
            <option value="">Aucune</option>{g.checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Consommables"><Input value={f.consumables} onChange={e => set('consumables', e.target.value)} placeholder="Huile, filtre, jeu de bavettes…" /></Field>
      <Field label="Mode opératoire / consigne"><Textarea rows={3} value={f.procedure} onChange={e => set('procedure', e.target.value)} placeholder="Ex. : à l’alerte, appeler le référent pour fixer le rendez-vous au garage." /></Field>
      {g.settings.safetyChecklistId && (
        <label className="flex items-center gap-2 text-sm font-semibold text-dark">
          <input type="checkbox" checked={f.safetyCheckRequired} onChange={e => set('safetyCheckRequired', e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />Analyse de sécurité obligatoire avant de démarrer
        </label>
      )}
    </Modal>
  );
};

const NextDueModal: React.FC<{ plan: PmPlan; asset: Asset; onClose: () => void }> = ({ plan, asset, onClose }) => {
  const { run } = useGmao();
  const e = plan.schedule[asset.id];
  const [val, setVal] = useState(plan.trigger === 'CALENDAIRE' ? (e?.nextDueAt ? civilOf(e.nextDueAt, OFFSET) : todayCivil()) : String(e?.nextDueMeter ?? ''));
  const [shift, setShift] = useState(true);
  const submit = async () => {
    const res = await run('PM_SET_NEXT', { id: plan.id, assetId: asset.id, nextDate: plan.trigger === 'CALENDAIRE' ? val : undefined, nextDueMeter: plan.trigger === 'COMPTEUR' ? val : undefined, shiftSeries: shift }, 'Échéance décalée.');
    if (res) onClose();
  };
  return (
    <Modal title="Décaler l'échéance" subtitle={`${plan.name} · ${asset.code}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!val}>Enregistrer</Button></>}>
      <Field label={plan.trigger === 'CALENDAIRE' ? 'Prochaine échéance' : `Prochaine échéance (${asset.meterType ? METER_UNIT[asset.meterType] : ''})`}>
        <Input type={plan.trigger === 'CALENDAIRE' ? 'date' : 'number'} value={val} onChange={ev => setVal(ev.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-dark">
        <input type="checkbox" checked={shift} onChange={ev => setShift(ev.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />
        Décaler aussi les échéances suivantes
      </label>
    </Modal>
  );
};

// ─── Calendrier annuel ───────────────────────────────────────────────────────

const AnnualCalendar: React.FC = () => {
  const g = useGmao();
  const [edit, setEdit] = useState<{ plan: PmPlan; asset: Asset } | null>(null);
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(start); d.setMonth(start.getMonth() + i); return d; });
  const monthIndex = (civil: string) => { const [y, m] = civil.split('-').map(Number); return (y - start.getFullYear()) * 12 + (m - 1) - start.getMonth(); };

  const rows = useMemo(() => {
    const out: { plan: PmPlan; asset: Asset; occ: number[]; estimate?: string }[] = [];
    for (const plan of g.pmPlans.filter(p => !p.isArchived && p.isActive)) {
      for (const id of plan.assetIds) {
        const asset = g.assetById(id);
        if (!asset || asset.isArchived || (g.isTech && !g.mine(asset))) continue;
        const e = plan.schedule[id];
        const occ = new Array(12).fill(0);
        if (e?.ended) continue;
        if (plan.trigger === 'CALENDAIRE' && plan.recurrence && e?.nextDueAt) {
          let due: string | null = civilOf(e.nextDueAt, OFFSET);
          for (let i = 0; i < 400 && due; i++) {
            const mi = monthIndex(due);
            if (mi >= 12) break;
            occ[Math.max(0, mi)]++;
            due = plan.recurrence.anchor === 'REALISATION' ? addPeriod(due, plan.recurrence) : nextOccurrence(plan.recurrence, e.startDate || due, due)?.date || null;
          }
          out.push({ plan, asset, occ });
        } else if (plan.trigger === 'COMPTEUR' && e?.nextDueMeter != null) {
          const readings = g.events.filter(x => x.assetId === id && x.type === 'METER' && new Date(x.at).getTime() > Date.now() - 90 * 86400000).sort((a, b) => a.at.localeCompare(b.at));
          let perDay = 0;
          if (readings.length >= 2) {
            const first = readings[0], last = readings[readings.length - 1];
            const days = (new Date(last.at).getTime() - new Date(first.at).getTime()) / 86400000;
            if (days > 0) perDay = ((last.value || 0) - (first.value || 0)) / days;
          }
          if (perDay > 0) {
            let target = e.nextDueMeter;
            const current = asset.meterValue || 0;
            for (let i = 0; i < 60; i++) {
              const d = civilOf(new Date(Date.now() + Math.max(0, (target - current) / perDay) * 86400000), OFFSET);
              const mi = monthIndex(d);
              if (mi >= 12) break;
              occ[Math.max(0, mi)]++;
              target += plan.meterInterval || 1;
            }
          }
          out.push({ plan, asset, occ, estimate: perDay > 0 ? `≈ ${fmtNum(perDay, 0)} ${asset.meterType ? METER_UNIT[asset.meterType] : ''}/j` : 'pas assez de relevés' });
        }
      }
    }
    return out.sort((a, b) => a.asset.code.localeCompare(b.asset.code));
  }, [g.pmPlans, g.assets, g.events]);

  const load = months.map((_, i) => rows.reduce((s, r) => s + r.occ[i] * (r.plan.estimatedHours || 0), 0));
  const maxLoad = Math.max(1, ...load);

  return (
    <Card className="overflow-x-auto">
      <div style={{ minWidth: 980 }}>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: '260px repeat(12, 1fr)' }}>
          <div className="px-4 py-3"><Label>Gamme · machine</Label></div>
          {months.map(m => <div key={m.toISOString()} className="py-3 text-center border-l border-border text-[10px] font-black uppercase tracking-widest text-gray-500">{m.toLocaleDateString('fr-FR', { month: 'short' })}<br /><span className="text-gray-300">{m.getFullYear()}</span></div>)}
        </div>
        <div className="grid border-b-2 border-border bg-gray-50/60" style={{ gridTemplateColumns: '260px repeat(12, 1fr)' }}>
          <div className="px-4 py-2"><Label>Charge estimée</Label></div>
          {load.map((h, i) => (
            <div key={i} className="border-l border-border px-1.5 py-2 flex flex-col justify-end items-center gap-1">
              <div className="w-full bg-primary/20 rounded-md" style={{ height: `${Math.max(2, (h / maxLoad) * 40)}px` }} />
              <span className="text-[10px] font-black text-dark">{fmtNum(h, 1)} h</span>
            </div>
          ))}
        </div>
        {rows.map(r => (
          <div key={`${r.plan.id}:${r.asset.id}`} className="grid border-b border-border last:border-0 hover:bg-gray-50/60" style={{ gridTemplateColumns: '260px repeat(12, 1fr)' }}>
            <button onClick={() => g.isResp && setEdit({ plan: r.plan, asset: r.asset })} className="px-4 py-2 text-left min-w-0" title={g.isResp ? "Décaler l'échéance" : undefined}>
              <div className="text-xs font-black text-dark truncate">{r.asset.code} · <span className="font-semibold text-gray-600">{r.plan.name}</span></div>
              <div className="text-[10px] text-gray-400 truncate">{r.plan.trigger === 'CALENDAIRE' && r.plan.recurrence ? describeRecurrence(r.plan.recurrence, r.plan.schedule[r.asset.id]?.startDate) : `tous les ${fmtNum(r.plan.meterInterval)} ${r.asset.meterType ? METER_UNIT[r.asset.meterType] : ''} · ${r.estimate}`}</div>
            </button>
            {r.occ.map((n, i) => (
              <div key={i} className="border-l border-border flex items-center justify-center py-2">
                {n > 0 && <span className={`min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${r.plan.trigger === 'COMPTEUR' ? 'bg-teal-100 text-teal-700 border border-dashed border-teal-300' : 'bg-teal-500 text-white'}`}>{n}</span>}
              </div>
            ))}
          </div>
        ))}
        {!rows.length && <Empty>Aucune gamme active.</Empty>}
      </div>
      <div className="px-4 py-3 text-[11px] text-gray-400 border-t border-border">Pastille pleine : échéance calendaire. Pointillés : estimation selon le rythme des relevés. Cliquez sur une ligne pour décaler une échéance et lisser la charge.</div>
      {edit && <NextDueModal plan={edit.plan} asset={edit.asset} onClose={() => setEdit(null)} />}
    </Card>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

export const PreventiveView: React.FC = () => {
  const g = useGmao();
  const [tab, setTab] = useState<'gammes' | 'calendrier'>('gammes');
  const [form, setForm] = useState<{ edit?: PmPlan } | null>(null);
  const [nextDue, setNextDue] = useState<{ plan: PmPlan; asset: Asset } | null>(null);
  const [scanning, setScanning] = useState(false);
  const plans = g.pmPlans.filter(p => !p.isArchived).sort((a, b) => a.name.localeCompare(b.name));

  const kpi = useMemo(() => {
    const start = Date.now() - 90 * 86400000;
    const prev = g.workOrders.filter(w => w.kind === 'PREVENTIF');
    const dueInPeriod = prev.filter(w => new Date(w.dueDate).getTime() >= start && new Date(w.dueDate).getTime() <= Date.now() && w.status !== 'ANNULE');
    const done = dueInPeriod.filter(w => w.status === 'CLOTURE');
    const equipments = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT');
    const covered = new Set(g.pmPlans.filter(p => !p.isArchived && p.isActive).flatMap(p => p.assetIds));
    const without = equipments.filter(a => !covered.has(a.id));
    const overdue = plans.filter(p => p.isActive).flatMap(p => p.assetIds.filter(id => isPmOverdue(p, p.schedule[id], g.assetById(id), new Date())));
    return { realised: dueInPeriod.length ? done.length / dueInPeriod.length : null, done: done.length, planned: dueInPeriod.length, without: without.length, overdue: overdue.length };
  }, [g.workOrders, g.assets, g.pmPlans]);

  const scan = async () => {
    setScanning(true);
    const res = await g.run('PM_SCAN', {});
    setScanning(false);
    if (res) g.toast(res.generatedWorkOrders?.length ? `${res.generatedWorkOrders.length} intervention(s) préventive(s) créée(s).` : 'Aucune nouvelle échéance.', 'info');
  };
  const toggle = (p: PmPlan) => g.run('PM_TOGGLE', { id: p.id, isActive: !p.isActive }, p.isActive ? 'Gamme désactivée.' : 'Gamme activée.');
  const archive = async (p: PmPlan) => {
    if (await g.confirm({ title: 'Archiver la gamme', message: `« ${p.name} » ne générera plus d'interventions.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('PM_ARCHIVE', { id: p.id }, 'Gamme archivée.');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Maintenance préventive"
        subtitle="Les interventions apparaissent « à faire » à l’approche de chaque échéance (calendrier ou compteur), une seule à la fois par machine."
        actions={g.isResp ? <>
          <Button variant="secondary" icon={<RefreshCw size={16} />} loading={scanning} onClick={scan}>Vérifier les échéances</Button>
          <Button icon={<Plus size={16} />} onClick={() => setForm({})}>Nouvelle gamme</Button>
        </> : undefined}
      />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi label="Réalisées / prévues (90 j)" value={fmtPct(kpi.realised)} sub={`${kpi.done} sur ${kpi.planned}`} tone={kpi.realised != null && kpi.realised < 0.8 ? 'warning' : 'success'} />
        <Kpi label="Échéances dépassées" value={kpi.overdue} tone={kpi.overdue ? 'danger' : 'default'} />
        <Kpi label="Machines sans préventif" value={kpi.without} />
      </div>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'gammes', label: 'Gammes' }, { value: 'calendrier', label: 'Calendrier annuel' }]} /></div>

      {tab === 'calendrier' ? <AnnualCalendar /> : (
        <div className="space-y-3">
          {plans.map(p => {
            const assetIds = p.assetIds.filter(id => !g.isTech || g.mine(g.assetById(id)));
            if (g.isTech && !assetIds.length) return null;
            return (
              <Card key={p.id} className={`p-4 ${p.isActive ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><ListChecks size={18} className="text-teal-600" /><h3 className="font-black text-dark">{p.name}</h3>
                      {p.typologyId && <Badge className="bg-teal-50 text-teal-700">Gamme type · {g.typologyName(p.typologyId)}</Badge>}
                      {!p.isActive && <Badge className="bg-gray-200 text-gray-600">Désactivée</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {p.trigger === 'CALENDAIRE' && p.recurrence ? describeRecurrence(p.recurrence, (Object.values(p.schedule || {})[0] as any)?.startDate) : `Tous les ${fmtNum(p.meterInterval)} km / h${p.meterAnchor === 'FIXE' ? ' (paliers fixes)' : ''}`}
                      {` · prévenir ${fmtNum(p.alertBefore)} ${p.trigger === 'CALENDAIRE' ? 'j' : 'unités'} avant`}
                      {p.estimatedHours ? ` · ${fmtNum(p.estimatedHours, 2)} h` : ''}{p.checklistId ? ' · check-list' : ''}
                    </div>
                  </div>
                  {g.isResp && (
                    <div className="flex gap-1">
                      <Button small variant="ghost" icon={<Pencil size={14} />} onClick={() => setForm({ edit: p })}>Modifier</Button>
                      <Button small variant="ghost" icon={<Power size={14} />} onClick={() => toggle(p)}>{p.isActive ? 'Désactiver' : 'Activer'}</Button>
                      <Button small variant="ghost" icon={<Archive size={14} />} onClick={() => archive(p)} aria-label="Archiver" />
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-1.5">
                  {assetIds.map(id => {
                    const a = g.assetById(id);
                    if (!a) return null;
                    const e = p.schedule[id];
                    const wo = g.workOrders.find(w => w.id === e?.openWorkOrderId && OPEN_WORK_ORDER_STATUSES.includes(w.status));
                    const overdue = isPmOverdue(p, e, a, new Date());
                    const unit = a.meterType ? METER_UNIT[a.meterType] : '';
                    return (
                      <div key={id} className="flex flex-wrap items-center gap-2 text-sm rounded-xl bg-gray-50/80 px-3 py-2">
                        <button onClick={() => g.openAsset(a.id)} className="font-black text-dark hover:text-primary">{a.code}</button>
                        <span className="text-gray-500 truncate flex-1 min-w-[120px]">{a.name}</span>
                        <span className={`text-xs font-bold ${overdue ? 'text-danger' : 'text-gray-500'}`}>
                          {e?.ended ? 'série terminée' : p.trigger === 'CALENDAIRE'
                            ? <>échéance {fmtDate(e?.nextDueAt)} ({relativeDays(e?.nextDueAt)})</>
                            : <>échéance {fmtNum(e?.nextDueMeter)} {unit} · actuel {fmtNum(a.meterValue)} {unit}</>}
                        </span>
                        {wo ? <button onClick={() => g.openWorkOrder(wo.id)} className="flex items-center gap-1"><WoStatusBadge s={wo.status} /><span className="text-[11px] font-bold text-primary">{wo.number}</span></button>
                          : g.isResp && !e?.ended && <button onClick={() => setNextDue({ plan: p, asset: a })} className="text-[11px] font-bold text-gray-400 hover:text-primary flex items-center gap-1"><CalendarRange size={12} />Décaler</button>}
                      </div>
                    );
                  })}
                  {!assetIds.length && <div className="text-xs text-gray-400">Aucune machine pour l’instant : elle sera appliquée aux nouvelles machines de la typologie.</div>}
                </div>
              </Card>
            );
          })}
          {!plans.length && <Card><Empty>Aucune gamme préventive. Créez-en une, ou appliquez un kit de démarrage dans Réglages.</Empty></Card>}
        </div>
      )}
      {form && <PlanFormModal edit={form.edit} onClose={() => setForm(null)} />}
      {nextDue && <NextDueModal plan={nextDue.plan} asset={nextDue.asset} onClose={() => setNextDue(null)} />}
    </div>
  );
};
