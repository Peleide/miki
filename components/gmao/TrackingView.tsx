import React, { useMemo, useState } from 'react';
import { Download, Printer, Search, X } from 'lucide-react';
import { KIND_LABEL, METER_UNIT, OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABEL, WorkOrder } from '../../functions/src/gmao/model';
import { hoursBetween } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import { Card, Empty, Input, PageHeader, Segmented, Select, Button, downloadCsv, fmtDate, fmtNum, WoStatusBadge, Badge } from './ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Tableau de suivi des maintenances (curatif + préventif), filtrable et exportable. */
export const TrackingView: React.FC = () => {
  const g = useGmao();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 365 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [status, setStatus] = useState<'DONE' | 'OPEN' | 'ALL'>('DONE');
  const [kind, setKind] = useState<'ALL' | 'CORRECTIF' | 'PREVENTIF'>('ALL');
  const [client, setClient] = useState('');
  const [typology, setTypology] = useState('');
  const [q, setQ] = useState('');
  const staff = !g.isClient;

  const dateOf = (w: WorkOrder) => (w.status === 'CLOTURE' ? w.actualEnd || w.closedAt : w.plannedStart || w.dueDate) || w.createdAt;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const t0 = new Date(`${from}T00:00:00`).getTime(), t1 = new Date(`${to}T23:59:59`).getTime();
    return g.workOrders
      .filter(w => w.status !== 'ANNULE')
      .filter(w => status === 'ALL' || (status === 'DONE' ? w.status === 'CLOTURE' : OPEN_WORK_ORDER_STATUSES.includes(w.status)))
      .filter(w => kind === 'ALL' || w.kind === kind)
      .filter(w => !client || (client === '__none' ? !w.clientId : w.clientId === client))
      .filter(w => !typology || (w.typologyId || g.assetById(w.assetId)?.typologyId) === typology)
      .filter(w => !g.isTech || w.assigneeIds.includes(g.me.id) || g.mine(g.assetById(w.assetId)))
      .filter(w => !s || `${w.assetCode} ${w.assetName} ${w.title} ${w.report || ''} ${w.number}`.toLowerCase().includes(s))
      .filter(w => { const t = new Date(dateOf(w)).getTime(); return status === 'OPEN' || (t >= t0 && t <= t1); })
      .sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  }, [g.workOrders, from, to, status, kind, client, typology, q]);

  const doneBy = (w: WorkOrder) => w.resourceType === 'EXTERNE' ? w.externalProvider || 'Prestataire' : (w.status === 'CLOTURE' ? w.closedByName : w.assigneeNames.join(', ')) || '—';
  const duration = (w: WorkOrder) => (w.status === 'CLOTURE' ? hoursBetween(w.actualStart, w.actualEnd) : 0);

  const exportCsv = () => {
    const header = ['Date', 'N°', 'Machine', 'Désignation', 'Typologie', 'Site', ...(staff ? ['Client'] : []), 'Nature', 'Type', 'Intitulé', 'Statut', 'Réalisé par', ...(staff ? ['Durée (h)'] : []), 'Compteur', 'Compte rendu'];
    downloadCsv(`suivi-maintenances-${iso(new Date())}.csv`, header, rows.map(w => {
      const a = g.assetById(w.assetId);
      return [
        fmtDate(dateOf(w)), w.number, w.assetCode, w.assetName, g.typologyName(w.typologyId || a?.typologyId), g.siteName(w.siteId),
        ...(staff ? [w.clientId ? g.clientName(w.clientId) : 'Parc interne'] : []),
        KIND_LABEL[w.kind], w.interventionType, w.title, WORK_ORDER_STATUS_LABEL[w.status], doneBy(w),
        ...(staff ? [w.status === 'CLOTURE' ? fmtNum(duration(w), 2) : ''] : []),
        w.meterAtClose != null ? `${w.meterAtClose} ${a?.meterType ? METER_UNIT[a.meterType] : ''}` : '', w.report || '',
      ];
    }));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Suivi des maintenances"
        subtitle={`${rows.length} intervention(s) · curatif et préventif${g.isClient ? ` · ${g.clientName(g.me.clientId)}` : ''}`}
        actions={<>
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>Imprimer</Button>
          <Button icon={<Download size={16} />} onClick={exportCsv} disabled={!rows.length}>Exporter (CSV)</Button>
        </>}
      />
      <Card className="p-4 mb-4 print:hidden">
        <div className="flex flex-wrap gap-2 items-end">
          <Segmented value={status} onChange={setStatus} options={[{ value: 'DONE', label: 'Réalisées' }, { value: 'OPEN', label: 'Prévues / en cours' }, { value: 'ALL', label: 'Toutes' }]} />
          <Segmented value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Tout' }, { value: 'CORRECTIF', label: 'Curatif' }, { value: 'PREVENTIF', label: 'Préventif' }]} />
          {status !== 'OPEN' && <>
            <label className="text-xs font-bold text-gray-500">Du<Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-40" /></label>
            <label className="text-xs font-bold text-gray-500">Au<Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-40" /></label>
          </>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="flex items-center gap-2 border border-border rounded-xl px-3 flex-1 min-w-[200px]">
            <Search size={16} className="text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Machine, intitulé, compte rendu…" className="flex-1 py-2 text-sm focus:outline-none" />
            {q && <button onClick={() => setQ('')} aria-label="Effacer"><X size={14} className="text-gray-400" /></button>}
          </div>
          {g.typologies.length > 0 && <div className="w-48"><Select value={typology} onChange={e => setTypology(e.target.value)}><option value="">Toutes typologies</option>{g.typologies.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>}
          {staff && g.clients.length > 0 && <div className="w-48"><Select value={client} onChange={e => setClient(e.target.value)}><option value="">Tous les clients</option><option value="__none">Parc interne</option>{g.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>}
        </div>
      </Card>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty>Aucune intervention sur ces critères.</Empty> : (
          <table className="w-full text-sm min-w-[820px]">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-border">
              <th className="px-4 py-2">Date</th><th className="px-3 py-2">Machine</th>{staff && <th className="px-3 py-2">Client</th>}<th className="px-3 py-2">Nature</th><th className="px-3 py-2">Intervention</th><th className="px-3 py-2">Par</th>{staff && <th className="px-3 py-2 text-right">Durée</th>}<th className="px-3 py-2">Statut</th>
            </tr></thead>
            <tbody>
              {rows.map(w => (
                <tr key={w.id} onClick={() => g.openWorkOrder(w.id)} className="border-b border-border last:border-0 hover:bg-gray-50/60 cursor-pointer align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap font-bold text-dark">{fmtDate(dateOf(w))}</td>
                  <td className="px-3 py-2.5"><b>{w.assetCode}</b> <span className="text-gray-500">{w.assetName}</span><div className="text-[11px] text-gray-400">{g.typologyName(w.typologyId || g.assetById(w.assetId)?.typologyId)}</div></td>
                  {staff && <td className="px-3 py-2.5 text-gray-600">{w.clientId ? g.clientName(w.clientId) : <span className="text-gray-400">Interne</span>}</td>}
                  <td className="px-3 py-2.5"><Badge className={w.kind === 'PREVENTIF' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}>{KIND_LABEL[w.kind]}</Badge></td>
                  <td className="px-3 py-2.5 max-w-[340px]"><div className="font-semibold text-dark">{w.title}</div>{w.report && <div className="text-xs text-gray-500 line-clamp-2">{w.report}</div>}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{doneBy(w)}</td>
                  {staff && <td className="px-3 py-2.5 text-right text-gray-600">{w.status === 'CLOTURE' ? `${fmtNum(duration(w), 1)} h` : ''}</td>}
                  <td className="px-3 py-2.5"><WoStatusBadge s={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
