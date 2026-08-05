import React, { useEffect, useState } from 'react';
import { User, IncidentReport, UserRole, Equipment } from '../types';
import { db, TimeUtils } from '../services/db';
import { ShieldCheck, MessageSquare, AlertTriangle, CheckSquare, Clock, ArrowRight, User as UserIcon, Wrench, X, CheckCircle, Archive, ChevronRight } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface TicketPanelProps {
  user: User;
}

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Faible', MEDIUM: 'Moyen', HIGH: 'Haute', CRITICAL: 'Critique' };
const PRIORITY_CLASS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-500',
  MEDIUM: 'bg-warning/10 text-warning',
  HIGH: 'bg-orange-100 text-orange-600',
  CRITICAL: 'bg-danger/10 text-danger',
};
const TYPE_LABEL: Record<string, string> = {
  BREAKDOWN: 'Panne', DAMAGE: 'Dommage', MISSING_PART: 'Pièce manquante',
  PERIODIC_MAINTENANCE: 'Maintenance préventive', OTHER: 'Autre',
};
const STATUS_LABEL: Record<string, string> = { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', ARCHIVED: 'Clôturé' };
const STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-danger/10 text-danger',
  IN_PROGRESS: 'bg-warning/10 text-warning',
  RESOLVED: 'bg-success/10 text-success',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};

export const TicketPanel: React.FC<TicketPanelProps> = ({ user }) => {
  const { toast, dialogNode } = useDialog();
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<IncidentReport | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [modalStep, setModalStep] = useState<'detail' | 'checklist'>('detail');
  const [activeChecklist, setActiveChecklist] = useState<any>(null);
  const [checklistAnswers, setChecklistAnswers] = useState<any>({});
  const [actionLoading, setActionLoading] = useState(false);

  const isManager = user.role === UserRole.MANAGER || user.role === UserRole.ADMIN;

  const loadData = async () => {
    setLoading(true);
    try {
      const [openRecs, progRecs, resRecs, eqs, chks] = await Promise.all([
        db.getIncidentReports(user.tenantId, 'OPEN'),
        db.getIncidentReports(user.tenantId, 'IN_PROGRESS'),
        db.getIncidentReports(user.tenantId, 'RESOLVED'),
        db.getEquipments(user.tenantId),
        db.getChecklists(user.tenantId),
      ]);
      setReports([...openRecs, ...progRecs, ...resRecs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setEquipments(eqs);
      setChecklists(chks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user.tenantId]);

  const closeModal = () => {
    setSelectedTicket(null);
    setResolutionNote('');
    setModalStep('detail');
    setActiveChecklist(null);
    setChecklistAnswers({});
  };

  const openTicket = (ticket: IncidentReport) => {
    setSelectedTicket(ticket);
    setResolutionNote('');
    setModalStep('detail');
    setActiveChecklist(null);
    setChecklistAnswers({});
  };

  const handleTake = async (ticket: IncidentReport) => {
    setActionLoading(true);
    try {
      await db.updateReportStatus(user.tenantId, ticket.id, 'IN_PROGRESS', user.id);
      await loadData();
      closeModal();
    } catch {
      toast('Erreur lors de la prise en charge.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveClick = (ticket: IncidentReport) => {
    const eq = equipments.find(e => e.id === ticket.equipmentId);
    const matches = eq ? checklists.filter(c =>
      c.triggerType === 'MAINTENANCE' && !c.isArchived &&
      (c.targetContext === 'ALL' ||
        (c.targetContext === 'TYPE' && c.targetValue === eq.type) ||
        (c.targetContext === 'SPECIFIC' && c.targetValue === eq.id))
    ) : [];

    if (matches.length > 0) {
      setActiveChecklist(matches[0]);
      setChecklistAnswers({});
      setModalStep('checklist');
    } else {
      doResolve(ticket.id);
    }
  };

  const doResolve = async (ticketId: string, answers?: any, checklist?: any) => {
    setActionLoading(true);
    try {
      if (answers && checklist) {
        const ticket = reports.find(r => r.id === ticketId);
        if (ticket) {
          await db.submitChecklistAnswers(user.tenantId, {
            equipmentId: ticket.equipmentId,
            checklistId: checklist.id,
            answers,
            equipmentNameSnapshot: ticket.equipmentNameSnapshot,
            checklistNameSnapshot: checklist.name,
          });
        }
      }
      await db.updateReportStatus(user.tenantId, ticketId, 'RESOLVED', user.id, resolutionNote || undefined);
      const ticket = reports.find(r => r.id === ticketId);
      if (ticket?.equipmentId && equipments.find(e => e.id === ticket.equipmentId)) {
        await db.processEquipmentScan(ticket.equipmentId, 'INTERVENTION', user, { userNote: `Résolution Incident ${ticketId}` });
      }
      await loadData();
      closeModal();
    } catch {
      toast('Erreur lors de la résolution.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitChecklist = async () => {
    if (!selectedTicket || !activeChecklist) return;
    for (const item of activeChecklist.items) {
      if (item.required && (checklistAnswers[item.id]?.value === undefined || checklistAnswers[item.id]?.value === '')) {
        toast(`Veuillez répondre à : ${item.label}`, 'info');
        return;
      }
    }
    await doResolve(selectedTicket.id, checklistAnswers, activeChecklist);
  };

  const handleArchive = async (ticket: IncidentReport) => {
    setActionLoading(true);
    try {
      await db.updateReportStatus(user.tenantId, ticket.id, 'ARCHIVED', undefined, resolutionNote || undefined);
      await loadData();
      closeModal();
    } catch {
      toast('Erreur lors de la clôture.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (ts: string) =>
    TimeUtils.formatInTimezone(ts, 'Pacific/Noumea', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const renderColumn = (title: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', icon: React.ReactNode, colorClass: string) => {
    const tickets = reports.filter(r => r.status === status);
    return (
      <div className="flex flex-col h-full bg-gray-50/50 rounded-[32px] border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className={`flex items-center gap-2 ${colorClass}`}>
            {icon}
            <h3 className="font-black uppercase tracking-widest text-xs">{title}</h3>
          </div>
          <span className="bg-white border text-xs font-black px-2.5 py-1 rounded-lg tabular-nums shadow-sm">{tickets.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
          {tickets.length === 0 && (
            <div className="text-center py-10 text-[10px] font-black uppercase text-gray-300 tracking-widest border-2 border-dashed border-gray-200 rounded-3xl">
              Aucun ticket
            </div>
          )}
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => openTicket(ticket)}
              className="w-full text-left bg-white p-5 rounded-[24px] border shadow-sm hover:shadow-xl hover:border-primary/20 transition-all group"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-black text-dark text-base leading-tight truncate">{ticket.equipmentNameSnapshot}</div>
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                    <Clock size={10} /> {formatDateTime(ticket.timestamp)}
                  </div>
                </div>
                <span className={`ml-2 shrink-0 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${PRIORITY_CLASS[ticket.priority] || 'bg-gray-100 text-gray-400'}`}>
                  {PRIORITY_LABEL[ticket.priority] || ticket.priority}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3 mt-3">
                {ticket.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[8px] font-black uppercase tracking-wider">{tag}</span>
                ))}
              </div>
              {ticket.message && (
                <div className="text-xs font-medium text-gray-500 bg-gray-50 p-3 rounded-xl italic line-clamp-2 mb-3">
                  "{ticket.message}"
                </div>
              )}
              <div className="pt-3 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    <UserIcon size={10} />
                  </div>
                  <span className="text-[9px] font-bold text-gray-400 truncate max-w-[100px]">{ticket.userNameSnapshot}</span>
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col font-sans">
      <div className="flex justify-between items-center mb-8 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-dark tracking-tight mb-1">Centre de Maintenance</h2>
          <p className="text-gray-400 text-sm font-medium">Gestion des signalements et des interventions.</p>
        </div>
        <button onClick={loadData} disabled={loading} className="text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-primary transition-colors px-4 py-2 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/10">
          {loading ? 'Chargement...' : 'Actualiser'}
        </button>
      </div>

      {loading && reports.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-300 animate-pulse font-black uppercase tracking-widest text-xs">
          Chargement des tickets...
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden pb-10">
          {renderColumn('Ouverts', 'OPEN', <AlertTriangle size={18} strokeWidth={2.5} />, 'text-danger')}
          {renderColumn('En cours', 'IN_PROGRESS', <Wrench size={18} strokeWidth={2.5} />, 'text-warning')}
          {renderColumn('Résolus', 'RESOLVED', <ShieldCheck size={18} strokeWidth={2.5} />, 'text-success')}
        </div>
      )}

      {/* ── MODAL DÉTAIL / CHECKLIST ── */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-[600] flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="bg-white w-full max-w-lg rounded-t-[40px] md:rounded-[40px] shadow-2xl animate-slide-up relative flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="flex items-start justify-between p-8 pb-4 shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg ${STATUS_CLASS[selectedTicket.status]}`}>
                    {STATUS_LABEL[selectedTicket.status]}
                  </span>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg ${PRIORITY_CLASS[selectedTicket.priority] || 'bg-gray-100 text-gray-400'}`}>
                    {PRIORITY_LABEL[selectedTicket.priority] || selectedTicket.priority}
                  </span>
                </div>
                <h2 className="text-xl font-black text-dark tracking-tight leading-tight">{selectedTicket.equipmentNameSnapshot}</h2>
              </div>
              <button onClick={closeModal} className="text-gray-300 hover:text-dark transition-colors shrink-0"><X size={26} /></button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-2">
              {modalStep === 'detail' ? (
                <div className="space-y-5">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Signalé par</div>
                      <div className="font-black text-dark text-sm truncate">{selectedTicket.userNameSnapshot}</div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</div>
                      <div className="font-black text-dark text-sm">{formatDateTime(selectedTicket.timestamp)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 col-span-2">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Type d'incident</div>
                      <div className="font-black text-dark text-sm">{TYPE_LABEL[selectedTicket.type] || selectedTicket.type}</div>
                    </div>
                  </div>

                  {/* Tags */}
                  {selectedTicket.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.tags.map(tag => (
                        <span key={tag} className="px-3 py-1.5 bg-warning/10 text-warning border border-warning/20 rounded-lg text-[9px] font-black uppercase tracking-wider">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Message */}
                  {selectedTicket.message && (
                    <div>
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MessageSquare size={11}/> Description</div>
                      <div className="text-sm font-medium text-gray-600 bg-gray-50 p-4 rounded-2xl italic leading-relaxed border border-gray-100">
                        "{selectedTicket.message}"
                      </div>
                    </div>
                  )}

                  {/* Resolution note (existing, if resolved) */}
                  {selectedTicket.resolutionNote && (
                    <div>
                      <div className="text-[9px] font-black text-success uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle size={11}/> Note de résolution</div>
                      <div className="text-sm font-medium text-gray-600 bg-success/5 p-4 rounded-2xl border border-success/20 leading-relaxed">
                        {selectedTicket.resolutionNote}
                      </div>
                    </div>
                  )}

                  {/* Resolution note input (for IN_PROGRESS or manager on any) */}
                  {(selectedTicket.status === 'IN_PROGRESS' || (isManager && selectedTicket.status !== 'ARCHIVED')) && !selectedTicket.resolutionNote && (
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Note de résolution (optionnelle)</label>
                      <textarea
                        rows={3}
                        placeholder="Décrivez l'intervention réalisée..."
                        value={resolutionNote}
                        onChange={e => setResolutionNote(e.target.value)}
                        className="w-full p-4 border-2 border-border rounded-2xl text-sm font-medium focus:border-primary outline-none resize-none leading-relaxed"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Checklist view */
                <div>
                  <div className="mb-4">
                    <h3 className="font-black text-dark text-lg mb-1">{activeChecklist.name}</h3>
                    <p className="text-[10px] text-warning font-black uppercase tracking-widest">Checklist de maintenance requise</p>
                  </div>
                  <div className="space-y-6">
                    {activeChecklist.items.map((item: any) => (
                      <div key={item.id} className="space-y-3">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          {item.label} {item.required && <span className="text-danger">*</span>}
                        </label>
                        {item.type === 'BOOLEAN' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setChecklistAnswers({ ...checklistAnswers, [item.id]: { value: true } })}
                              className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${checklistAnswers[item.id]?.value === true ? 'bg-success text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100'}`}
                            >OUI</button>
                            <button
                              onClick={() => setChecklistAnswers({ ...checklistAnswers, [item.id]: { value: false } })}
                              className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${checklistAnswers[item.id]?.value === false ? 'bg-danger text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100'}`}
                            >NON</button>
                          </div>
                        ) : item.type === 'NUMBER' ? (
                          <input
                            type="number"
                            placeholder="Saisissez une valeur..."
                            value={checklistAnswers[item.id]?.value || ''}
                            onChange={e => setChecklistAnswers({ ...checklistAnswers, [item.id]: { value: parseFloat(e.target.value) } })}
                            className="w-full p-4 border-2 border-border rounded-2xl text-xs font-bold focus:border-primary outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="Observation..."
                            value={checklistAnswers[item.id]?.value || ''}
                            onChange={e => setChecklistAnswers({ ...checklistAnswers, [item.id]: { value: e.target.value } })}
                            className="w-full p-4 border-2 border-border rounded-2xl text-xs font-bold focus:border-primary outline-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-8 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] shrink-0 space-y-3">
              {modalStep === 'checklist' ? (
                <div className="flex gap-3">
                  <button onClick={() => setModalStep('detail')} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl border">Retour</button>
                  <button onClick={handleSubmitChecklist} disabled={actionLoading} className="flex-[2] py-4 bg-success text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-success/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> Valider & Clore
                  </button>
                </div>
              ) : selectedTicket.status === 'OPEN' ? (
                <div className="flex gap-3">
                  {isManager && (
                    <button onClick={() => handleArchive(selectedTicket)} disabled={actionLoading} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl border disabled:opacity-50">
                      Fermer
                    </button>
                  )}
                  <button onClick={() => handleTake(selectedTicket)} disabled={actionLoading} className="flex-[2] py-5 bg-primary text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    Prendre en charge <ArrowRight size={14} />
                  </button>
                </div>
              ) : selectedTicket.status === 'IN_PROGRESS' ? (
                <div className="flex gap-3">
                  {isManager && (
                    <button onClick={() => handleArchive(selectedTicket)} disabled={actionLoading} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl border disabled:opacity-50">
                      Fermer
                    </button>
                  )}
                  {(selectedTicket.assignedTo === user.id || isManager) && (
                    <button onClick={() => handleResolveClick(selectedTicket)} disabled={actionLoading} className="flex-[2] py-5 bg-success text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-success/20 disabled:opacity-50 flex items-center justify-center gap-2">
                      <CheckSquare size={14} /> Marquer résolu
                    </button>
                  )}
                  {selectedTicket.assignedTo !== user.id && !isManager && (
                    <div className="flex-1 py-4 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 rounded-2xl border">
                      Pris par un autre technicien
                    </div>
                  )}
                </div>
              ) : selectedTicket.status === 'RESOLVED' ? (
                isManager ? (
                  <button onClick={() => handleArchive(selectedTicket)} disabled={actionLoading} className="w-full py-5 bg-dark text-white font-black rounded-2xl uppercase tracking-widest text-[10px] disabled:opacity-50 flex items-center justify-center gap-2">
                    <Archive size={14} /> Archiver le ticket
                  </button>
                ) : (
                  <div className="py-4 text-center text-[10px] font-black text-success/60 uppercase tracking-widest bg-success/5 rounded-2xl border border-success/10 flex items-center justify-center gap-2">
                    <ShieldCheck size={14} /> Ticket résolu
                  </div>
                )
              ) : (
                <div className="py-4 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 rounded-2xl border">
                  Ticket clôturé
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </div>
  );
};
