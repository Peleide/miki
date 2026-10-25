import React, { useMemo, useState } from 'react';
import { Printer, AlertOctagon, Wrench, CalendarClock, Flag, Gauge, ClipboardCheck, MessageSquare } from 'lucide-react';
import { KIND_LABEL, OPEN_WORK_ORDER_STATUSES, PLANS, METER_UNIT } from '../../functions/src/gmao/model';
import { availabilityRate, isPmOverdue } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import { Button, Card, Empty, fmtDate, fmtDateTime, fmtNum, fmtPct, Kpi, Label, Meter, PageHeader, PriorityBadge, Segmented, sinceLabel, StateBadge, WoStatusBadge, relativeDays, Badge } from './ui';
import { isLate } from './WorkOrdersView';
import { RequestRow } from './RequestsView';
import { RequestFormModal } from './RequestsView';

const Bar: React.FC<{ value: number; max: number; className?: string }> = ({ value, max, className = 'bg-primary' }) => (
  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${className}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>
);

/** Utilisation de l'offre (responsable). */
export const PlanUsage: React.FC = () => {
  const g = useGmao();
  if (!g.plan) return null;
  const machines = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT').length;
  const techs = g.users.filter(u => u.role === 'TECHNICIEN').length;
  const clients = g.clients.filter(c => !c.isArchived).length;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3"><Label>Offre {PLANS[g.plan.tier].label}</Label>{PLANS[g.plan.tier].priceXpf ? <span className="text-xs text-gray-400">{PLANS[g.plan.tier].priceXpf!.toLocaleString('fr-FR')} XPF / an</span> : null}</div>
      <div className="space-y-3">
        <Meter label="Machines actives" used={machines} max={g.plan.maxAssets} />
        <Meter label="Techniciens" used={techs} max={g.plan.maxTechnicians} />
        <Meter label="Clients" used={clients} max={g.plan.maxClients} />
      </div>
    </Card>
  );
};

// ─── Espace client ───────────────────────────────────────────────────────────

const ClientHome: React.FC = () => {
  const g = useGmao();
  const [creating, setCreating] = useState<null | 'PROBLEME' | 'REMARQUE'>(null);
  const machines = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT');
  const done = g.workOrders.filter(w => w.status === 'CLOTURE').sort((a, b) => (b.actualEnd || '').localeCompare(a.actualEnd || ''));
  const open = g.workOrders.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
  const upcoming = machines.filter(a => a.nextPm).sort((a, b) => Number(!!b.nextPm?.overdue) - Number(!!a.nextPm?.overdue) || (a.nextPm?.dueAt || '9').localeCompare(b.nextPm?.dueAt || '9')).slice(0, 8);
  const myReqs = g.requests.filter(r => r.status === 'A_TRAITER' || r.status === 'APPROUVEE' || r.status === 'PLANIFIEE');
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title={g.clientName(g.me.clientId)} subtitle={`Suivi de maintenance de vos ${machines.length} machine(s) par ${g.tenantName}.`} actions={<>
        <Button variant="secondary" icon={<MessageSquare size={16} />} onClick={() => setCreating('REMARQUE')}>Remarque</Button>
        <Button icon={<Flag size={16} />} onClick={() => setCreating('PROBLEME')}>Signaler un problème</Button>
      </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Machines suivies" value={machines.length} onClick={() => g.navigate('parc')} />
        <Kpi label="Maintenances (12 mois)" value={done.filter(w => new Date(w.actualEnd || w.closedAt || 0).getTime() > Date.now() - 365 * 86400000).length} onClick={() => g.navigate('suivi')} />
        <Kpi label="En cours" value={open.length} />
        <Kpi label="À l’arrêt" value={machines.filter(a => a.state === 'INDISPONIBLE').length} tone={machines.some(a => a.state === 'INDISPONIBLE') ? 'danger' : 'default'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardCheck size={16} className="text-primary" /><Label>Dernières maintenances</Label></div><button className="text-xs font-bold text-primary" onClick={() => g.navigate('suivi')}>Tout le suivi →</button></div>
          {done.slice(0, 8).map(w => (
            <button key={w.id} onClick={() => g.openWorkOrder(w.id)} className="w-full text-left px-5 py-3 border-b border-border last:border-0 hover:bg-gray-50/70">
              <div className="flex items-center gap-2 text-sm"><span className="text-xs font-black text-gray-500 w-20">{fmtDate(w.actualEnd)}</span><b>{w.assetName}</b></div>
              <div className="text-xs text-gray-500 pl-[88px] truncate">{KIND_LABEL[w.kind]} · {w.title}</div>
            </button>
          ))}
          {!done.length && <Empty>Aucune maintenance enregistrée.</Empty>}
        </Card>
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><CalendarClock size={16} className="text-primary" /><Label>Prochaines maintenances prévues</Label></div>
          {upcoming.map(a => (
            <button key={a.id} onClick={() => g.openAsset(a.id)} className="w-full text-left px-5 py-3 border-b border-border last:border-0 hover:bg-gray-50/70 flex items-center gap-2">
              <span className="flex-1 min-w-0"><span className="text-sm font-bold text-dark">{a.name}</span><span className="block text-xs text-gray-500 truncate">{a.nextPm!.planName}</span></span>
              <span className={`text-xs font-black ${a.nextPm!.overdue ? 'text-danger' : 'text-gray-500'}`}>{a.nextPm!.dueAt ? fmtDate(a.nextPm!.dueAt) : `${fmtNum(a.nextPm!.dueMeter)} ${a.meterType ? METER_UNIT[a.meterType] : ''}`}</span>
            </button>
          ))}
          {!upcoming.length && <Empty>Pas de maintenance programmée.</Empty>}
        </Card>
        {myReqs.length > 0 && <Card className="overflow-hidden lg:col-span-2"><div className="px-5 py-4 border-b border-border"><Label>Vos signalements en cours</Label></div>{myReqs.map(r => <RequestRow key={r.id} r={r} />)}</Card>}
      </div>
      {creating && <RequestFormModal kind={creating} onClose={() => setCreating(null)} />}
    </div>
  );
};

// ─── Tableau de bord maintenance ─────────────────────────────────────────────

export const DashboardView: React.FC = () => (useGmao().isClient ? <ClientHome /> : <StaffDashboard />);

const StaffDashboard: React.FC = () => {
  const g = useGmao();
  const [period, setPeriod] = useState<'30' | '90' | '365'>('90');

  const equipments = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT' && g.mine(a));
  const ids = new Set(equipments.map(a => a.id));
  const down = equipments.filter(a => a.state !== 'OPERATIONNEL').sort((a, b) => (a.state === 'INDISPONIBLE' ? 0 : 1) - (b.state === 'INDISPONIBLE' ? 0 : 1) || a.stateSince.localeCompare(b.stateSince));
  const wos = g.workOrders.filter(w => ids.has(w.assetId) || (g.isTech && w.assigneeIds.includes(g.me.id)));
  const openWos = wos.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
  const pending = g.requests.filter(r => r.status === 'A_TRAITER' && ids.has(r.assetId));
  const pmOverdue = g.pmPlans.filter(p => p.isActive && !p.isArchived).flatMap(p => p.assetIds.filter(id => ids.has(id) && isPmOverdue(p, p.schedule[id], g.assetById(id), new Date())));
  const soon = equipments.filter(a => a.nextPm && !a.nextPm.overdue && a.nextPm.dueAt && new Date(a.nextPm.dueAt).getTime() < Date.now() + 14 * 86400000).sort((a, b) => a.nextPm!.dueAt!.localeCompare(b.nextPm!.dueAt!));

  const stats = useMemo(() => {
    const end = Date.now();
    const start = end - Number(period) * 86400000;
    const closed = wos.filter(w => w.status === 'CLOTURE' && w.closedAt && new Date(w.closedAt).getTime() >= start);
    const rates = equipments.map(a => availabilityRate(a, g.events, start, end)).filter((r): r is number => r != null);
    const byTyp = Array.from(new Set(equipments.map(a => a.typologyId || ''))).map(t => {
      const list = equipments.filter(a => (a.typologyId || '') === t);
      return { name: t ? g.typologyName(t) : 'Sans typologie', count: list.length, done: closed.filter(w => list.some(a => a.id === w.assetId)).length };
    }).sort((a, b) => b.count - a.count);
    return {
      closed, corrective: closed.filter(w => w.kind === 'CORRECTIF').length, preventive: closed.filter(w => w.kind === 'PREVENTIF').length,
      availability: rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null, byTyp,
    };
  }, [period, g.workOrders, g.events, g.assets]);

  const linkedWo = (assetId: string) => openWos.filter(w => w.assetId === assetId).sort((a, b) => a.priority.localeCompare(b.priority))[0];
  const maxTyp = Math.max(1, ...stats.byTyp.map(t => t.count));

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Tableau de bord" subtitle={`${equipments.length} machine(s)${g.isTech ? ' dans votre parc' : ' suivies'}`} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi label="Signalements à traiter" value={pending.length} tone={pending.length ? 'danger' : 'default'} onClick={() => g.navigate('signalements')} />
        <Kpi label="Interventions ouvertes" value={openWos.length} sub={`${openWos.filter(w => w.status === 'A_PLANIFIER').length} à planifier`} onClick={() => g.navigate('interventions')} />
        <Kpi label="En retard" value={openWos.filter(isLate).length} tone={openWos.some(isLate) ? 'danger' : 'default'} onClick={() => g.navigate('interventions')} />
        <Kpi label="Préventif échu" value={pmOverdue.length} tone={pmOverdue.length ? 'warning' : 'default'} onClick={() => g.navigate('preventif')} />
        <Kpi label="À l’arrêt" value={down.filter(a => a.state === 'INDISPONIBLE').length} tone="danger" />
        <Kpi label="Mode dégradé" value={down.filter(a => a.state === 'DEGRADE').length} tone="warning" />
      </div>

      {pending.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2"><Flag size={18} className="text-danger" /><h2 className="font-black text-dark">Signalements à traiter</h2></div>
          {pending.sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 6).map(r => <RequestRow key={r.id} r={r} />)}
        </Card>
      )}

      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><AlertOctagon size={18} className="text-danger" /><h2 className="font-black text-dark">Machines à l’arrêt ou dégradées</h2></div>
          <button onClick={() => window.print()} className="text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1 print:hidden"><Printer size={14} />Imprimer</button>
        </div>
        {down.length === 0 ? <Empty>Tout le parc est opérationnel.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-border">
                <th className="px-5 py-2">Machine</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Depuis</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2">Intervention</th>
              </tr></thead>
              <tbody>
                {down.map(a => {
                  const w = linkedWo(a.id);
                  return (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-gray-50/60 cursor-pointer" onClick={() => g.openAsset(a.id)}>
                      <td className="px-5 py-2.5"><b>{a.code}</b> <span className="text-gray-500">{a.name}</span>{a.clientId && <span className="text-gray-400 text-xs"> · {g.clientName(a.clientId)}</span>}</td>
                      <td className="px-3 py-2.5"><StateBadge state={a.state} /></td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{sinceLabel(a.stateSince)}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[260px]">{a.stateReason}</td>
                      <td className="px-3 py-2.5" onClick={e => { if (w) { e.stopPropagation(); g.openWorkOrder(w.id); } }}>
                        {w ? <div className="flex flex-wrap items-center gap-1.5"><PriorityBadge p={w.priority} /><WoStatusBadge s={w.status} /><span className="text-xs text-gray-500">{w.status === 'EN_ATTENTE' ? w.holdReason : w.plannedStart ? `${fmtDateTime(w.plannedStart)} · ${w.assigneeNames.join(', ')}` : `éch. ${relativeDays(w.dueDate)}`}</span></div>
                          : <span className="text-xs text-danger font-bold">Aucune intervention</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3"><CalendarClock size={16} className="text-primary" /><Label>Préventif des 14 prochains jours</Label></div>
          {soon.length ? soon.slice(0, 10).map(a => (
            <button key={a.id} onClick={() => g.openAsset(a.id)} className="w-full text-left py-2 border-b border-gray-50 last:border-0 flex items-center gap-2 text-sm">
              <span className="text-xs font-black text-gray-500 w-24 shrink-0">{fmtDate(a.nextPm!.dueAt)}</span>
              <b className="shrink-0">{a.code}</b><span className="text-gray-600 truncate flex-1">{a.name} · {a.nextPm!.planName}</span>
              {a.clientId && <Badge className="bg-gray-100 text-gray-500">{g.clientName(a.clientId)}</Badge>}
            </button>
          )) : <Empty>Rien d’échu dans les 14 jours.</Empty>}
        </Card>
        {g.isResp ? <PlanUsage /> : (
          <Card className="p-5">
            <Label className="mb-3">Mes interventions</Label>
            <div className="text-3xl font-black text-dark">{openWos.filter(w => w.assigneeIds.includes(g.me.id)).length}</div>
            <div className="text-xs text-gray-500">ouvertes, dont {openWos.filter(w => w.assigneeIds.includes(g.me.id) && isLate(w)).length} en retard</div>
            <Button className="mt-4" small variant="secondary" onClick={() => g.navigate('planning')}>Mon planning</Button>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-black text-dark text-lg">Activité</h2>
        <Segmented value={period} onChange={setPeriod} options={[{ value: '30', label: '30 jours' }, { value: '90', label: '90 jours' }, { value: '365', label: '12 mois' }]} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Kpi label="Disponibilité du parc" value={fmtPct(stats.availability)} sub="mode dégradé compté disponible" tone={stats.availability != null && stats.availability < 0.9 ? 'warning' : 'success'} />
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Wrench size={16} className="text-primary" /><Label>Interventions réalisées</Label></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Curatif</span><b>{stats.corrective}</b></div>
            <div className="flex justify-between"><span>Préventif</span><b>{stats.preventive}</b></div>
            <div className="flex justify-between text-gray-500"><span>Part du préventif</span><b>{fmtPct(stats.closed.length ? stats.preventive / stats.closed.length : null)}</b></div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3"><Gauge size={16} className="text-primary" /><Label>Par typologie</Label></div>
          <div className="space-y-3">
            {stats.byTyp.map(t => (
              <div key={t.name}>
                <div className="flex justify-between text-sm mb-1"><span className="text-dark font-semibold">{t.name} <span className="text-gray-400">({t.count})</span></span><span className="text-xs text-gray-500">{t.done} interv.</span></div>
                <Bar value={t.count} max={maxTyp} />
              </div>
            ))}
            {!stats.byTyp.length && <Empty>Aucune machine.</Empty>}
          </div>
        </Card>
      </div>
    </div>
  );
};
