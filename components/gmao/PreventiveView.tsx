import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Pencil, Power, Archive, CalendarRange, ListChecks, AlertTriangle } from 'lucide-react';
import {
  Asset, CALENDAR_UNIT_LABEL, CalendarUnit, INTERVENTION_TYPES, METER_UNIT, PmPlan, PRIORITIES, PRIORITY_LABEL,
  OPEN_WORK_ORDER_STATUSES,
} from '../../functions/src/gmao/model';
import { addInterval, isPmOverdue } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, Empty, Field, fmtDate, fmtNum, fmtPct, fromDateInput, Input, Kpi, Label, Modal,
  PageHeader, Segmented, Select, Textarea, toDateInput, relativeDays, WoStatusBadge,
} from './ui';

// ─── Formulaire de gamme ─────────────────────────────────────────────────────

const PlanFormModal: React.FC<{ onClose: () => void; edit?: PmPlan }> = ({ onClose, edit }) => {
  const { assets, siteName, checklists, run, settings, toast } = useGmao();
  const [f, setF] = useState({
    name: edit?.name || '',
    trigger: edit?.trigger || 'CALENDAIRE',
    intervalValue: edit?.intervalValue ?? 1,
    intervalUnit: (edit?.intervalUnit || 'MOIS') as CalendarUnit,
    alertBefore: edit?.alertBefore ?? 7,
    interventionType: edit?.interventionType || 'MECANIQUE',
    priority: edit?.priority || 'P3',
    procedure: edit?.procedure || '',
    checklistId: edit?.checklistId || '',
    consumables: edit?.consumables || '',
    estimatedHours: edit?.estimatedHours ?? '',
    safetyCheckRequired: edit ? edit.safetyCheckRequired : !!settings.safetyChecklistId,
    firstDueAt: '',
  });
  const [assetIds, setAssetIds] = useState<string[]>(edit?.assetIds || []);
  const [picker, setPicker] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const selected = assetIds.map(id => assets.find(a => a.id === id)).filter(Boolean) as Asset[];
  const counterIssue = f.trigger === 'COMPTEUR' && selected.some(a => !a.meterType);

  const addAsset = (id: string) => { if (id && !assetIds.includes(id)) setAssetIds([...assetIds, id]); setPicker(''); };

  const submit = async () => {
    setSaving(true);
    const res = await run('PM_SAVE', { ...f, id: edit?.id, assetIds, checklistId: f.checklistId || null, firstDueAt: f.firstDueAt ? fromDateInput(f.firstDueAt) : null }, edit ? 'Gamme mise à jour.' : 'Gamme créée.');
    setSaving(false);
    if (res) {
      if (res.generatedWorkOrders?.length) toast(`${res.generatedWorkOrders.length} bon(s) de travail déjà échu(s) créé(s).`, 'info');
      onClose();
    }
  };

  return (
    <Modal wide title={edit ? `Modifier « ${edit.name} »` : 'Nouvelle gamme préventive'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!f.name.trim() || !assetIds.length || counterIssue}>{edit ? 'Enregistrer' : 'Créer la gamme'}</Button>
    </>}>
      <Field label="Nom de la gamme" required><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex. : Vidange moteur 500 h" /></Field>
      <Field label="Déclenchement">
        <Segmented value={f.trigger as any} onChange={v => set('trigger', v)} options={[{ value: 'CALENDAIRE', label: 'Calendrier (systématique)' }, { value: 'COMPTEUR', label: 'Compteur (heures / km)' }]} />
      </Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={f.trigger === 'CALENDAIRE' ? 'Tous les' : 'Toutes les (unités du compteur)'}>
          <Input type="number" min={1} value={f.intervalValue} onChange={e => set('intervalValue', e.target.value)} />
        </Field>
        {f.trigger === 'CALENDAIRE' && (
          <Field label="Unité"><Select value={f.intervalUnit} onChange={e => set('intervalUnit', e.target.value)}>{(Object.keys(CALENDAR_UNIT_LABEL) as CalendarUnit[]).map(u => <option key={u} value={u}>{CALENDAR_UNIT_LABEL[u]}</option>)}</Select></Field>
        )}
        <Field label={f.trigger === 'CALENDAIRE' ? 'Alerte (jours avant)' : 'Alerte (unités avant)'} hint="Le BT est créé à ce moment-là.">
          <Input type="number" min={0} value={f.alertBefore} onChange={e => set('alertBefore', e.target.value)} />
        </Field>
      </div>
      {f.trigger === 'CALENDAIRE' && !edit && (
        <Field label="Première échéance" hint="Vide : dans un intervalle. Choisissez des dates différentes pour étaler la charge sur l'année.">
          <Input type="date" value={f.firstDueAt} onChange={e => set('firstDueAt', e.target.value)} />
        </Field>
      )}

      <Field label="Équipements" required>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {selected.map(a => (
              <Badge key={a.id} className={`${f.trigger === 'COMPTEUR' && !a.meterType ? 'bg-danger/10 text-danger' : 'bg-gray-100 text-dark'} normal-case tracking-normal text-xs`}>
                {a.code}
                <button type="button" onClick={() => setAssetIds(assetIds.filter(x => x !== a.id))} className="ml-1 text-gray-400 hover:text-danger">×</button>
              </Badge>
            ))}
          </div>
          <AssetPicker assets={assets.filter(a => !assetIds.includes(a.id))} value={picker} onChange={addAsset} siteName={siteName} />
          {counterIssue && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle size={12} />Certains équipements n'ont pas de compteur.</p>}
        </div>
      </Field>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Type d'intervention"><Select value={f.interventionType} onChange={e => set('interventionType', e.target.value)}>{INTERVENTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}</Select></Field>
        <Field label="Priorité des BT"><Select value={f.priority} onChange={e => set('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select></Field>
        <Field label="Durée estimée (h)"><Input type="number" min={0} step={0.5} value={f.estimatedHours as any} onChange={e => set('estimatedHours', e.target.value)} /></Field>
      </div>
      <Field label="Check-list associée">
        <Select value={f.checklistId} onChange={e => set('checklistId', e.target.value)}>
          <option value="">Aucune</option>{checklists.filter(c => c.kind === 'MAINTENANCE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Consommables"><Input value={f.consumables} onChange={e => set('consumables', e.target.value)} placeholder="Huile 15W40, filtres…" /></Field>
      <Field label="Mode opératoire"><Textarea rows={4} value={f.procedure} onChange={e => set('procedure', e.target.value)} /></Field>
      {settings.safetyChecklistId && (
        <label className="flex items-center gap-2 text-sm font-semibold text-dark">
          <input type="checkbox" checked={f.safetyCheckRequired} onChange={e => set('safetyCheckRequired', e.target.checked)} className="w-4 h-4 accent-[#EE6E0A]" />Take 5 obligatoire avant de démarrer
        </label>
      )}
    </Modal>
  );
};

const NextDueModal: React.FC<{ plan: PmPlan; asset: Asset; onClose: () => void }> = ({ plan, asset, onClose }) => {
  const { run } = useGmao();
  const e = plan.schedule[asset.id];
  const [val, setVal] = useState(plan.trigger === 'CALENDAIRE' ? toDateInput(e?.nextDueAt) : String(e?.nextDueMeter ?? ''));
  const submit = async () => {
    const res = await run('PM_SET_NEXT', { id: plan.id, assetId: asset.id, nextDueAt: plan.trigger === 'CALENDAIRE' ? fromDateInput(val) : undefined, nextDueMeter: plan.trigger === 'COMPTEUR' ? val : undefined }, 'Échéance replanifiée.');
    if (res) onClose();
  };
  return (
    <Modal title="Replanifier l'échéance" subtitle={`${plan.name} · ${asset.code}`} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} disabled={!val}>Enregistrer</Button></>}>
      <Field label={plan.trigger === 'CALENDAIRE' ? 'Prochaine échéance' : `Prochaine échéance (${asset.meterType ? METER_UNIT[asset.meterType] : ''})`}>
        <Input type={plan.trigger === 'CALENDAIRE' ? 'date' : 'number'} value={val} onChange={ev => setVal(ev.target.value)} />
      </Field>
    </Modal>
  );
};

// ─── Calendrier annuel ───────────────────────────────────────────────────────

const AnnualCalendar: React.FC = () => {
  const g = useGmao();
  const [edit, setEdit] = useState<{ plan: PmPlan; asset: Asset } | null>(null);
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(start); d.setMonth(start.getMonth() + i); return d; });
  const monthIndex = (iso: string) => { const d = new Date(iso); return (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth(); };

  const rows = useMemo(() => {
    const out: { plan: PmPlan; asset: Asset; occ: number[]; estimate?: string }[] = [];
    for (const plan of g.pmPlans.filter(p => !p.isArchived && p.isActive)) {
      for (const id of plan.assetIds) {
        const asset = g.assetById(id);
        if (!asset || asset.isArchived) continue;
        const e = plan.schedule[id];
        const occ = new Array(12).fill(0);
        if (plan.trigger === 'CALENDAIRE' && e?.nextDueAt) {
          let due = e.nextDueAt;
          for (let i = 0; i < 60; i++) {
            const mi = monthIndex(due);
            if (mi >= 12) break;
            if (mi >= 0) occ[mi]++; else occ[0]++; // en retard : compté sur le mois courant
            due = addInterval(due, plan.intervalValue, plan.intervalUnit || 'MOIS');
          }
          out.push({ plan, asset, occ });
        } else if (plan.trigger === 'COMPTEUR' && e?.nextDueMeter != null) {
          // Projection à partir du rythme d'utilisation des 90 derniers jours
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
              const d = new Date(Date.now() + Math.max(0, (target - current) / perDay) * 86400000);
              const mi = monthIndex(d.toISOString());
              if (mi >= 12) break;
              occ[Math.max(0, mi)]++;
              target += plan.intervalValue;
            }
          }
          out.push({ plan, asset, occ, estimate: perDay > 0 ? `≈ ${fmtNum(perDay, 1)} ${asset.meterType ? METER_UNIT[asset.meterType] : ''}/j` : 'pas assez de relevés' });
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
          <div className="px-4 py-3"><Label>Gamme · équipement</Label></div>
          {months.map(m => <div key={m.toISOString()} className="py-3 text-center border-l border-border text-[10px] font-black uppercase tracking-widest text-gray-500">{m.toLocaleDateString('fr-FR', { month: 'short' })}<br /><span className="text-gray-300">{m.getFullYear()}</span></div>)}
        </div>
        <div className="grid border-b-2 border-border bg-gray-50/60" style={{ gridTemplateColumns: '260px repeat(12, 1fr)' }}>
          <div className="px-4 py-2"><Label>Charge estimée</Label></div>
          {load.map((h, i) => (
            <div key={i} className="border-l border-border px-1.5 py-2 flex flex-col justify-end items-center gap-1">
              <div className="w-full bg-primary/20 rounded-md" style={{ height: `${Math.max(2, (h / maxLoad) * 40)}px` }} />
              <span className="text-[10px] font-black text-dark">{fmtNum(h)} h</span>
            </div>
          ))}
        </div>
        {rows.map(r => (
          <div key={`${r.plan.id}:${r.asset.id}`} className="grid border-b border-border last:border-0 hover:bg-gray-50/60" style={{ gridTemplateColumns: '260px repeat(12, 1fr)' }}>
            <button onClick={() => g.isResp && setEdit({ plan: r.plan, asset: r.asset })} className="px-4 py-2 text-left min-w-0" title={g.isResp ? "Replanifier l'échéance" : undefined}>
              <div className="text-xs font-black text-dark truncate">{r.asset.code} · <span className="font-semibold text-gray-600">{r.plan.name}</span></div>
              <div className="text-[10px] text-gray-400">{r.plan.trigger === 'CALENDAIRE' ? `tous les ${r.plan.intervalValue} ${CALENDAR_UNIT_LABEL[r.plan.intervalUnit || 'MOIS']}` : `tous les ${fmtNum(r.plan.intervalValue)} ${r.asset.meterType ? METER_UNIT[r.asset.meterType] : ''} · ${r.estimate}`}</div>
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
    const dueInPeriod = prev.filter(w => new Date(w.dueDate).getTime() >= start && new Date(w.dueDate).getTime() <= Date.now());
    const done = dueInPeriod.filter(w => w.status === 'CLOTURE');
    const notified = prev.filter(w => w.generatedAutomatically && new Date(w.createdAt).getTime() >= start);
    const refused = notified.filter(w => w.status === 'ANNULE');
    const held = notified.filter(w => w.status === 'EN_ATTENTE');
    const equipments = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT');
    const covered = new Set(g.pmPlans.filter(p => !p.isArchived && p.isActive).flatMap(p => p.assetIds));
    const without = equipments.filter(a => !covered.has(a.id));
    const overdue = plans.filter(p => p.isActive).flatMap(p => p.assetIds.filter(id => isPmOverdue(p, p.schedule[id], g.assetById(id), new Date())));
    return {
      realised: dueInPeriod.length ? done.length / dueInPeriod.length : null,
      done: done.length, planned: dueInPeriod.length,
      refusedRate: notified.length ? refused.length / notified.length : null,
      heldRate: notified.length ? held.length / notified.length : null,
      without: without.length, withoutRate: equipments.length ? without.length / equipments.length : null,
      overdue: overdue.length,
    };
  }, [g.workOrders, g.assets, g.pmPlans]);

  const scan = async () => {
    setScanning(true);
    const res = await g.run('PM_SCAN', {});
    setScanning(false);
    if (res) g.toast(res.generatedWorkOrders?.length ? `${res.generatedWorkOrders.length} BT préventif(s) créé(s).` : 'Aucune nouvelle échéance.', 'info');
  };
  const toggle = (p: PmPlan) => g.run('PM_TOGGLE', { id: p.id, isActive: !p.isActive }, p.isActive ? 'Gamme désactivée.' : 'Gamme activée.');
  const archive = async (p: PmPlan) => {
    if (await g.confirm({ title: 'Archiver la gamme', message: `« ${p.name} » ne générera plus de bons de travail.`, variant: 'danger', confirmLabel: 'Archiver' })) g.run('PM_ARCHIVE', { id: p.id }, 'Gamme archivée.');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Maintenance préventive"
        subtitle="Les bons de travail sont créés automatiquement à l'approche de chaque échéance (calendrier ou compteur)."
        actions={g.isResp ? <>
          <Button variant="secondary" icon={<RefreshCw size={16} />} loading={scanning} onClick={scan}>Vérifier les échéances</Button>
          <Button icon={<Plus size={16} />} onClick={() => setForm({})}>Nouvelle gamme</Button>
        </> : undefined}
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Kpi label="Réalisés / prévus (90 j)" value={fmtPct(kpi.realised)} sub={`${kpi.done} sur ${kpi.planned}`} tone={kpi.realised != null && kpi.realised < 0.8 ? 'warning' : 'success'} />
        <Kpi label="Échéances dépassées" value={kpi.overdue} tone={kpi.overdue ? 'danger' : 'default'} />
        <Kpi label="Équipements sans gamme" value={fmtPct(kpi.withoutRate)} sub={`${kpi.without} équipement(s)`} />
        <Kpi label="Alertes refusées" value={fmtPct(kpi.refusedRate)} sub="BT préventifs annulés" />
        <Kpi label="Alertes en attente" value={fmtPct(kpi.heldRate)} sub="BT mis en attente" />
      </div>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'gammes', label: 'Gammes' }, { value: 'calendrier', label: 'Calendrier annuel' }]} /></div>

      {tab === 'calendrier' ? <AnnualCalendar /> : (
        <div className="space-y-3">
          {plans.map(p => (
            <Card key={p.id} className={`p-4 ${p.isActive ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><ListChecks size={18} className="text-teal-600" /><h3 className="font-black text-dark">{p.name}</h3>{!p.isActive && <Badge className="bg-gray-200 text-gray-600">Désactivée</Badge>}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.trigger === 'CALENDAIRE' ? `Tous les ${p.intervalValue} ${CALENDAR_UNIT_LABEL[p.intervalUnit || 'MOIS']} · alerte ${p.alertBefore} j avant` : `Toutes les ${fmtNum(p.intervalValue)} unités compteur · alerte ${fmtNum(p.alertBefore)} avant`}
                    {' · '}{p.priority}{p.estimatedHours ? ` · ${fmtNum(p.estimatedHours, 1)} h` : ''}{p.checklistId ? ` · check-list` : ''}{p.procedure ? ' · mode opératoire' : ''}
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
                {p.assetIds.map(id => {
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
                        {p.trigger === 'CALENDAIRE'
                          ? <>échéance {fmtDate(e?.nextDueAt)} ({relativeDays(e?.nextDueAt)})</>
                          : <>échéance {fmtNum(e?.nextDueMeter)} {unit} · actuel {fmtNum(a.meterValue)} {unit}</>}
                      </span>
                      {wo ? <button onClick={() => g.openWorkOrder(wo.id)} className="flex items-center gap-1"><WoStatusBadge s={wo.status} /><span className="text-[11px] font-bold text-primary">{wo.number}</span></button>
                        : g.isResp && <button onClick={() => setNextDue({ plan: p, asset: a })} className="text-[11px] font-bold text-gray-400 hover:text-primary flex items-center gap-1"><CalendarRange size={12} />Décaler</button>}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!plans.length && <Card><Empty>Aucune gamme préventive. Créez-en une pour planifier vidanges, contrôles et révisions.</Empty></Card>}
        </div>
      )}
      {form && <PlanFormModal edit={form.edit} onClose={() => setForm(null)} />}
      {nextDue && <NextDueModal plan={nextDue.plan} asset={nextDue.asset} onClose={() => setNextDue(null)} />}
    </div>
  );
};
