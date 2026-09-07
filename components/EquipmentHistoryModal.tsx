import React, { useEffect, useState } from 'react';
import { Equipment, EquipmentLog, IncidentReport, Signalement, UserRole } from '../types';
import { db } from '../services/db';
import { X, Loader2, LogIn, LogOut, Wrench, Flag, AlertTriangle, ArchiveRestore, Archive, RefreshCw, CheckCircle, Clock } from 'lucide-react';

interface Props {
  equipment: Equipment;
  tenantId: string;
  onClose: () => void;
  isManager?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h00`;
}

type TimelineEntry =
  | { kind: 'log';        date: string; data: EquipmentLog }
  | { kind: 'ticket';     date: string; data: IncidentReport }
  | { kind: 'signalement'; date: string; data: Signalement };

const LOG_ACTION_LABEL: Record<string, string> = {
  TAKE: 'Emprunté',
  RETURN: 'Restitué',
  FORCE_RETURN: 'Restitution forcée',
  REPORT: 'Signalement (scan)',
  INTERVENTION: 'Intervention',
  CREATE: 'Créé',
  ARCHIVE: 'Archivé',
};

const LOG_ICON: Record<string, React.ReactNode> = {
  TAKE:         <LogIn  size={14} className="text-primary"/>,
  RETURN:       <LogOut size={14} className="text-success"/>,
  FORCE_RETURN: <LogIn  size={14} className="text-orange-500"/>,
  REPORT:       <Flag   size={14} className="text-amber-500"/>,
  INTERVENTION: <Wrench size={14} className="text-indigo-500"/>,
  CREATE:       <CheckCircle size={14} className="text-gray-400"/>,
  ARCHIVE:      <Archive size={14} className="text-gray-400"/>,
};

const TICKET_STATUS_CLASS: Record<string, string> = {
  OPEN: 'text-danger', IN_PROGRESS: 'text-amber-600', RESOLVED: 'text-success', ARCHIVED: 'text-gray-400',
};
const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Ouvert', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', ARCHIVED: 'Clôturé',
};

export const EquipmentHistoryModal: React.FC<Props> = ({ equipment, tenantId, onClose, isManager }) => {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [counts, setCounts] = useState({ logs: 0, tickets: 0, signalements: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { logs, tickets, signalements } = await db.getEquipmentHistory(tenantId, equipment.id);

        const entries: TimelineEntry[] = [
          ...logs.map(l => ({ kind: 'log' as const,         date: l.timestamp,  data: l })),
          ...tickets.map(t => ({ kind: 'ticket' as const,    date: t.timestamp,  data: t })),
          ...signalements.map(s => ({ kind: 'signalement' as const, date: s.createdAt, data: s })),
        ].sort((a, b) => b.date.localeCompare(a.date));

        setTimeline(entries);
        setCounts({ logs: logs.length, tickets: tickets.length, signalements: signalements.length });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [equipment.id, tenantId]);

  // Paire TAKE→RETURN : durée d'utilisation (chronologique, oldest first)
  const usageDurations = new Map<string, number>();
  if (isManager) {
    let lastTake: { id: string; ts: string } | null = null;
    [...timeline].reverse().forEach(entry => {
      if (entry.kind !== 'log') return;
      const log = entry.data;
      if (log.action === 'TAKE') {
        lastTake = { id: log.id, ts: log.timestamp };
      } else if ((log.action === 'RETURN' || log.action === 'FORCE_RETURN') && lastTake) {
        const mins = Math.round((new Date(log.timestamp).getTime() - new Date(lastTake.ts).getTime()) / 60000);
        if (mins > 0) usageDurations.set(log.id, mins);
        lastTake = null;
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[500] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-lg bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right-4">

        {/* Header */}
        <div className="p-6 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Fiche de vie</p>
              <h2 className="font-black text-dark text-lg tracking-tight leading-snug">{equipment.name}</h2>
              <p className="text-xs font-bold text-gray-400 mt-1">{equipment.brand} {equipment.model}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-dark hover:bg-gray-100 rounded-xl transition-all shrink-0">
              <X size={20}/>
            </button>
          </div>

          {/* Identity chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {equipment.serialNumber && (
              <span className="text-[9px] font-black px-2 py-1 bg-gray-100 rounded-lg uppercase tracking-widest text-gray-500">S/N : {equipment.serialNumber}</span>
            )}
            {equipment.storageLocation && (
              <span className="text-[9px] font-black px-2 py-1 bg-gray-100 rounded-lg uppercase tracking-widest text-gray-500">{equipment.storageLocation}</span>
            )}
            <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${equipment.isArchived ? 'bg-gray-200 text-gray-500' : equipment.status === 'AVAILABLE' ? 'bg-success/10 text-success' : equipment.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
              {equipment.isArchived ? 'Archivé' : equipment.status === 'AVAILABLE' ? 'Disponible' : equipment.status === 'IN_USE' ? 'Emprunté' : 'Maintenance'}
            </span>
          </div>

          {/* Counters */}
          {!loading && (
            <div className="flex gap-4 mt-4">
              <div className="text-center">
                <p className="font-black text-dark text-lg leading-none">{counts.logs}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Mouvements</p>
              </div>
              <div className="w-px bg-border"/>
              <div className="text-center">
                <p className="font-black text-dark text-lg leading-none">{counts.tickets}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Tickets</p>
              </div>
              <div className="w-px bg-border"/>
              <div className="text-center">
                <p className="font-black text-dark text-lg leading-none">{counts.signalements}</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Signalements</p>
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={32} className="text-primary animate-spin"/>
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-20">
              <Clock size={36} className="text-gray-200 mx-auto mb-3"/>
              <p className="text-gray-400 font-bold text-sm">Aucun historique</p>
              <p className="text-gray-300 text-xs font-medium mt-1">Les événements apparaîtront ici</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border"/>

              <div className="space-y-0">
                {timeline.map((entry, i) => {
                  const date = new Date(entry.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                  if (entry.kind === 'log') {
                    const log = entry.data;
                    return (
                      <div key={`log-${log.id}`} className="flex gap-4 pb-6 relative">
                        <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center shrink-0 z-10">
                          {LOG_ICON[log.action] || <RefreshCw size={14} className="text-gray-400"/>}
                        </div>
                        <div className="flex-1 pt-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-dark text-sm">{LOG_ACTION_LABEL[log.action] || log.action}</p>
                            {log.isAPosteriori && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">
                                <Clock size={9}/> a posteriori
                              </span>
                            )}
                          </div>
                          {log.agentNameSnapshot && <p className="text-xs font-bold text-gray-500 mt-0.5">par {log.agentNameSnapshot}</p>}
                          {log.isAPosteriori && log.declaredAt && (
                            <p className="text-[9px] font-bold text-amber-600 mt-0.5">
                              Heure déclarée : {new Date(log.declaredAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {log.userNote && <p className="text-xs text-gray-400 font-medium mt-1 italic">"{log.userNote}"</p>}
                          {isManager && usageDurations.has(log.id) && (
                            <p className="text-[9px] font-bold text-indigo-500 mt-0.5">
                              Durée d'utilisation : {formatDuration(usageDurations.get(log.id)!)}
                            </p>
                          )}
                          {isManager && log.durationMinutes != null && (
                            <p className="text-[9px] font-bold text-indigo-500 mt-0.5">
                              Durée d'intervention : {formatDuration(log.durationMinutes)}
                            </p>
                          )}
                          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1">{date}</p>
                        </div>
                      </div>
                    );
                  }

                  if (entry.kind === 'ticket') {
                    const t = entry.data;
                    return (
                      <div key={`ticket-${t.id}`} className="flex gap-4 pb-6 relative">
                        <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center shrink-0 z-10">
                          <Wrench size={14} className="text-indigo-500"/>
                        </div>
                        <div className="flex-1 pt-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-dark text-sm">Ticket</p>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${TICKET_STATUS_CLASS[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-500 mt-0.5 truncate">{t.message}</p>
                          {t.resolutionNote && <p className="text-xs text-gray-400 font-medium mt-1 italic">Résolution : {t.resolutionNote}</p>}
                          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1">{date}</p>
                        </div>
                      </div>
                    );
                  }

                  if (entry.kind === 'signalement') {
                    const s = entry.data;
                    return (
                      <div key={`sig-${s.id}`} className="flex gap-4 pb-6 relative">
                        <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center shrink-0 z-10">
                          <Flag size={14} className="text-amber-500"/>
                        </div>
                        <div className="flex-1 pt-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-dark text-sm">Signalement</p>
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">{s.status}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-500 mt-0.5 truncate">{s.title}</p>
                          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mt-1">{date} · par {s.createdByName}</p>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
