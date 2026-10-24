import React, { useMemo, useState } from 'react';
import { Printer, AlertOctagon, Gauge, Wrench, Inbox, Clock, CalendarCheck } from 'lucide-react';
import { FAMILIES, INTERVENTION_TYPES, OPEN_WORK_ORDER_STATUSES, WorkOrderStatus, WORK_ORDER_STATUS_LABEL } from '../../functions/src/gmao/model';
import { availabilityRate, isPmOverdue, workOrderCost } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import { Card, Empty, fmtDate, fmtDateTime, fmtNum, fmtPct, fmtXpf, Kpi, Label, PageHeader, PriorityBadge, Segmented, sinceLabel, StateBadge, WoStatusBadge, relativeDays } from './ui';
import { isLate } from './WorkOrdersView';

const Bar: React.FC<{ value: number; max: number; className?: string }> = ({ value, max, className = 'bg-primary' }) => (
  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${className}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
);

export const DashboardView: React.FC = () => {
  const g = useGmao();
  const [period, setPeriod] = useState<'30' | '90' | '365'>('90');
  const [site, setSite] = useState('');

  const equipments = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT' && (!site || a.siteId === site));
  const down = equipments.filter(a => a.state !== 'OPERATIONNEL').sort((a, b) => (a.state === 'INDISPONIBLE' ? 0 : 1) - (b.state === 'INDISPONIBLE' ? 0 : 1) || a.stateSince.localeCompare(b.stateSince));
  const wosSite = g.workOrders.filter(w => !site || w.siteId === site);
  const openWos = wosSite.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
  const pmOverdue = g.pmPlans.filter(p => p.isActive && !p.isArchived).flatMap(p => p.assetIds.filter(id => {
    const a = g.assetById(id);
    return a && (!site || a.siteId === site) && isPmOverdue(p, p.schedule[id], a, new Date());
  }));

  const stats = useMemo(() => {
    const end = Date.now();
    const start = end - Number(period) * 86400000;
    const closed = wosSite.filter(w => w.status === 'CLOTURE' && w.closedAt && new Date(w.closedAt).getTime() >= start);
    const corrective = closed.filter(w => w.kind === 'CORRECTIF');
    const preventive = closed.filter(w => w.kind === 'PREVENTIF');
    const rates = equipments.map(a => availabilityRate(a, g.events, start, end)).filter((r): r is number => r != null);
    const availability = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
    const byFamily = FAMILIES.map(f => {
      const list = equipments.filter(a => a.family === f.code);
      const r = list.map(a => availabilityRate(a, g.events, start, end)).filter((x): x is number => x != null);
      return { ...f, count: list.length, rate: r.length ? r.reduce((s, x) => s + x, 0) / r.length : null };
    }).filter(f => f.count);
    const repairs = corrective.filter(w => w.actualStart && w.actualEnd);
    const mttr = repairs.length ? repairs.reduce((s, w) => s + (new Date(w.actualEnd!).getTime() - new Date(w.actualStart!).getTime()) / 3600000, 0) / repairs.length : null;
    const spanH = equipments.reduce((s, a) => s + Math.max(0, end - Math.max(start, new Date(a.createdAt).getTime())), 0) / 3600000;
    const uptimeH = availability != null ? spanH * availability : null;
    const mtbf = corrective.length && uptimeH != null ? uptimeH / corrective.length : null;
    const cost = (list: typeof closed) => list.reduce((acc, w) => {
      const c = workOrderCost(w, g.settings.hourlyRate);
      acc.labor += c.labor; acc.parts += c.parts; acc.external += c.external; acc.total += c.total; return acc;
    }, { labor: 0, parts: 0, external: 0, total: 0 });
    const noProcedure = closed.filter(w => !w.procedure && !w.checklistId);
    const prevHours = preventive.reduce((s, w) => s + (w.laborHours || 0), 0);
    const corrHours = corrective.reduce((s, w) => s + (w.laborHours || 0), 0);
    const inPeriod = wosSite.filter(w => new Date(w.createdAt).getTime() >= start);
    const byType = INTERVENTION_TYPES.map(t => {
      const list = inPeriod.filter(w => w.interventionType === t.code);
      const byStatus: Partial<Record<WorkOrderStatus, number>> = {};
      list.forEach(w => { byStatus[w.status] = (byStatus[w.status] || 0) + 1; });
      return { ...t, total: list.length, byStatus };
    }).filter(t => t.total);
    const topCost = equipments.map(a => ({ a, c: closed.filter(w => w.assetId === a.id).reduce((s, w) => s + workOrderCost(w, g.settings.hourlyRate).total, 0), n: corrective.filter(w => w.assetId === a.id).length }))
      .filter(x => x.c || x.n).sort((x, y) => y.c - x.c).slice(0, 6);
    return { closed, corrective, preventive, availability, byFamily, mttr, mtbf, costCorr: cost(corrective), costPrev: cost(preventive), costAll: cost(closed), noProcedure, prevHours, corrHours, byType, topCost };
  }, [period, site, g.workOrders, g.events, g.assets, g.settings.hourlyRate]);

  const linkedWo = (assetId: string) => openWos.filter(w => w.assetId === assetId).sort((a, b) => a.priority.localeCompare(b.priority))[0];
  const statusCols: WorkOrderStatus[] = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE', 'CLOTURE', 'ANNULE'];

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Tableau de bord"
        subtitle={`${equipments.length} équipements suivis${site ? ` · ${g.siteName(site)}` : ''}`}
        actions={<>
          <Segmented value={site || 'ALL'} onChange={v => setSite(v === 'ALL' ? '' : v)} options={[{ value: 'ALL', label: 'Tous sites' }, ...g.sites.filter(s => s.status !== 'ARCHIVED').map(s => ({ value: s.id, label: s.name }))]} />
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi label="À l'arrêt" value={down.filter(a => a.state === 'INDISPONIBLE').length} tone="danger" onClick={() => document.getElementById('point-hebdo')?.scrollIntoView({ behavior: 'smooth' })} />
        <Kpi label="Mode dégradé" value={down.filter(a => a.state === 'DEGRADE').length} tone="warning" />
        <Kpi label="DI à approuver" value={g.requests.filter(r => r.status === 'A_APPROUVER' && (!site || r.siteId === site)).length} onClick={() => g.navigate('demandes')} />
        <Kpi label="BT ouverts" value={openWos.length} sub={`${openWos.filter(w => w.status === 'A_PLANIFIER').length} à planifier`} onClick={() => g.navigate('travaux')} />
        <Kpi label="BT en retard" value={openWos.filter(isLate).length} tone={openWos.some(isLate) ? 'danger' : 'default'} onClick={() => g.navigate('travaux')} />
        <Kpi label="Préventif échu" value={pmOverdue.length} tone={pmOverdue.length ? 'warning' : 'default'} onClick={() => g.navigate('preventif')} />
      </div>

      <Card className="mb-6 overflow-hidden" >
        <div id="point-hebdo" className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><AlertOctagon size={18} className="text-danger" /><h2 className="font-black text-dark">Machines arrêtées ou dégradées</h2></div>
          <button onClick={() => window.print()} className="text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1 print:hidden"><Printer size={14} />Imprimer le point hebdo</button>
        </div>
        {down.length === 0 ? <Empty>Tout le parc est opérationnel.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-border">
                <th className="px-5 py-2">Équipement</th><th className="px-3 py-2">Site</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Depuis</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2">Intervention</th>
              </tr></thead>
              <tbody>
                {down.map(a => {
                  const w = linkedWo(a.id);
                  return (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-gray-50/60 cursor-pointer" onClick={() => g.openAsset(a.id)}>
                      <td className="px-5 py-2.5"><b>{a.code}</b> <span className="text-gray-500">{a.name}</span></td>
                      <td className="px-3 py-2.5 text-gray-600">{g.siteName(a.siteId)}</td>
                      <td className="px-3 py-2.5"><StateBadge state={a.state} /></td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{sinceLabel(a.stateSince)}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[260px]">{a.stateReason}</td>
                      <td className="px-3 py-2.5" onClick={e => { if (w) { e.stopPropagation(); g.openWorkOrder(w.id); } }}>
                        {w ? <div className="flex flex-wrap items-center gap-1.5"><PriorityBadge p={w.priority} /><WoStatusBadge s={w.status} /><span className="text-xs text-gray-500">{w.status === 'EN_ATTENTE' ? w.holdReason : w.plannedStart ? `${fmtDateTime(w.plannedStart)} · ${w.assigneeNames.join(', ')}` : `éch. ${relativeDays(w.dueDate)}`}</span></div>
                          : <span className="text-xs text-danger font-bold">Aucun BT</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-black text-dark text-lg">Indicateurs</h2>
        <Segmented value={period} onChange={setPeriod} options={[{ value: '30', label: '30 jours' }, { value: '90', label: '90 jours' }, { value: '365', label: '12 mois' }]} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Disponibilité du parc" value={fmtPct(stats.availability)} sub="mode dégradé compté disponible" tone={stats.availability != null && stats.availability < 0.9 ? 'warning' : 'success'} />
        <Kpi label="MTBF" value={stats.mtbf != null ? `${fmtNum(stats.mtbf)} h` : '—'} sub="temps moyen entre pannes" />
        <Kpi label="MTTR" value={stats.mttr != null ? `${fmtNum(stats.mttr, 1)} h` : '—'} sub="temps moyen de réparation" />
        <Kpi label="Coût maintenance" value={fmtXpf(stats.costAll.total)} sub={`${stats.closed.length} BT clôturés`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Gauge size={16} className="text-primary" /><Label>Disponibilité par type</Label></div>
          <div className="space-y-3">
            {stats.byFamily.map(f => (
              <div key={f.code}>
                <div className="flex justify-between text-sm mb-1"><span className="text-dark font-semibold">{f.label} <span className="text-gray-400">({f.count})</span></span><span className="font-black">{fmtPct(f.rate)}</span></div>
                <Bar value={f.rate || 0} max={1} className={f.rate != null && f.rate < 0.9 ? 'bg-orange-400' : 'bg-success'} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Wrench size={16} className="text-primary" /><Label>Correctif / préventif</Label></div>
          <div className="space-y-4 text-sm">
            <div>
              <div className="flex justify-between mb-1"><span>BT correctifs</span><b>{stats.corrective.length}</b></div>
              <div className="flex justify-between mb-1"><span>BT préventifs</span><b>{stats.preventive.length}</b></div>
              <div className="flex justify-between"><span>Part du préventif (heures)</span><b>{fmtPct(stats.prevHours + stats.corrHours ? stats.prevHours / (stats.prevHours + stats.corrHours) : null)}</b></div>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex justify-between mb-1"><span>Coût correctif</span><b>{fmtXpf(stats.costCorr.total)}</b></div>
              <div className="flex justify-between mb-1"><span>Coût préventif</span><b>{fmtXpf(stats.costPrev.total)}</b></div>
              <div className="flex justify-between text-gray-500 text-xs mt-2"><span>dont main d'œuvre interne</span><span>{fmtXpf(stats.costAll.labor)}</span></div>
              <div className="flex justify-between text-gray-500 text-xs"><span>dont pièces</span><span>{fmtXpf(stats.costAll.parts)}</span></div>
              <div className="flex justify-between text-gray-500 text-xs"><span>dont prestataires</span><span>{fmtXpf(stats.costAll.external)}</span></div>
              {!g.settings.hourlyRate && <p className="text-[11px] text-orange-500 mt-2">Taux horaire non renseigné (Réglages) : la main d'œuvre interne n'est pas valorisée.</p>}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Clock size={16} className="text-primary" /><Label>Équipements les plus coûteux</Label></div>
          {stats.topCost.length ? (
            <div className="space-y-3">
              {stats.topCost.map(({ a, c, n }) => (
                <button key={a.id} onClick={() => g.openAsset(a.id)} className="w-full text-left">
                  <div className="flex justify-between text-sm mb-1"><span><b>{a.code}</b> <span className="text-gray-500">{n} panne(s)</span></span><b>{fmtXpf(c)}</b></div>
                  <Bar value={c} max={stats.topCost[0].c} />
                </button>
              ))}
            </div>
          ) : <Empty>Pas de coût sur la période.</Empty>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 overflow-x-auto">
          <div className="flex items-center gap-2 mb-4"><CalendarCheck size={16} className="text-primary" /><Label>Interventions par type et état (créées sur la période)</Label></div>
          {stats.byType.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-left"><th className="py-1">Type</th>{statusCols.map(s => <th key={s} className="py-1 px-2 text-center">{WORK_ORDER_STATUS_LABEL[s]}</th>)}<th className="py-1 px-2 text-center">Total</th></tr></thead>
              <tbody>{stats.byType.map(t => (
                <tr key={t.code} className="border-t border-border"><td className="py-1.5">{t.label}</td>{statusCols.map(s => <td key={s} className="text-center text-gray-600">{t.byStatus[s] || ''}</td>)}<td className="text-center font-black">{t.total}</td></tr>
              ))}</tbody>
            </table>
          ) : <Empty>Aucune intervention sur la période.</Empty>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4"><Inbox size={16} className="text-primary" /><Label>Qualité des interventions</Label></div>
          <div className="text-sm space-y-2">
            <div className="flex justify-between"><span>Sans mode opératoire ni check-list</span><b>{stats.noProcedure.length}</b></div>
            <div className="flex justify-between"><span>en % des BT clôturés</span><b>{fmtPct(stats.closed.length ? stats.noProcedure.length / stats.closed.length : null)}</b></div>
            <div className="flex justify-between"><span>Rapports renseignés</span><b>{fmtPct(stats.closed.length ? stats.closed.filter(w => (w.report || '').trim()).length / stats.closed.length : null)}</b></div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Dernière mise à jour : {fmtDate(new Date().toISOString())}</p>
        </Card>
      </div>
    </div>
  );
};
