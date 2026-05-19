import React, { useEffect, useState } from 'react';
import { User, IncidentReport, UserRole, Equipment } from '../types';
import { db, TimeUtils } from '../services/db';
import { ShieldCheck, MessageSquare, AlertTriangle, MapPin, CheckSquare, Clock, ArrowRight, User as UserIcon, Wrench, X, CheckCircle } from 'lucide-react';

interface TicketPanelProps {
  user: User;
}

export const TicketPanel: React.FC<TicketPanelProps> = ({ user }) => {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [resolvingTicket, setResolvingTicket] = useState<IncidentReport | null>(null);
  const [activeChecklist, setActiveChecklist] = useState<any>(null);
  const [checklistAnswers, setChecklistAnswers] = useState<any>({});

  const loadData = async () => {
      setLoading(true);
      try {
          const [openRecs, progRecs, resRecs, eqs, chks] = await Promise.all([
              db.getIncidentReports(user.tenantId, 'OPEN'),
              db.getIncidentReports(user.tenantId, 'IN_PROGRESS'),
              db.getIncidentReports(user.tenantId, 'RESOLVED'),
              db.getEquipments(user.tenantId),
              db.getChecklists(user.tenantId)
          ]);
          setReports([...openRecs, ...progRecs, ...resRecs].sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
          setEquipments(eqs);
          setChecklists(chks);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => { loadData(); }, [user.tenantId]);

  const handleTakeTicket = async (reportId: string) => {
      try {
          await db.updateReportStatus(user.tenantId, reportId, 'IN_PROGRESS', user.id);
          await loadData();
      } catch (e) {
          alert("Erreur lors de la prise en charge.");
      }
  };

  const doResolve = async (ticketId: string, customAnswers?: any, _activeChecklist?: any) => {
      try {
          if (customAnswers && _activeChecklist) {
              const ticket = reports.find(r => r.id === ticketId);
              if (ticket) {
                  await db.submitChecklistAnswers(user.tenantId, {
                      equipmentId: ticket.equipmentId,
                      checklistId: _activeChecklist.id,
                      answers: customAnswers,
                      equipmentNameSnapshot: ticket.equipmentNameSnapshot,
                      checklistNameSnapshot: _activeChecklist.name,
                  });
              }
          }

          await db.updateReportStatus(user.tenantId, ticketId, 'RESOLVED', user.id);
          // if there is equipmentId, update equipment status to AVAILABLE
          const ticket = reports.find(r => r.id === ticketId);
          if (ticket?.equipmentId && equipments.find(e => e.id === ticket.equipmentId)) {
               await db.processEquipmentScan(ticket.equipmentId, 'RETURN', user, { userNote: `Résolution Incident ${ticketId}` });
          }

          await loadData();
          setResolvingTicket(null);
          setActiveChecklist(null);
      } catch (e) {
          alert("Erreur lors de la résolution.");
      }
  };

  const handleResolveClick = (ticket: IncidentReport) => {
      const eq = equipments.find(e => e.id === ticket.equipmentId);
      if (!eq) return doResolve(ticket.id); 

      const matches = checklists.filter(c => 
            c.triggerType === 'MAINTENANCE' && !c.isArchived &&
            (c.targetContext === 'ALL' || 
             (c.targetContext === 'TYPE' && c.targetValue === eq.type) ||
             (c.targetContext === 'SPECIFIC' && c.targetValue === eq.id))
      );
      if (matches.length > 0) {
          setResolvingTicket(ticket);
          setActiveChecklist(matches[0]);
          setChecklistAnswers({});
      } else {
          doResolve(ticket.id);
      }
  };

  const handleSubmitChecklist = async () => {
      if (!resolvingTicket || !activeChecklist) return;

      for (const item of activeChecklist.items) {
          if (item.required && (checklistAnswers[item.id]?.value === undefined || checklistAnswers[item.id]?.value === '')) {
              alert(`Veuillez répondre à: ${item.label}`);
              return;
          }
      }
      
      await doResolve(resolvingTicket.id, checklistAnswers, activeChecklist);
  };

  const formatDateTime = (ts: string) => TimeUtils.formatInTimezone(ts, 'Europe/Paris', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
                      <div key={ticket.id} className="bg-white p-5 rounded-[24px] border shadow-sm group hover:shadow-xl transition-all relative">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <div className="font-black text-dark text-lg leading-tight">{ticket.equipmentNameSnapshot}</div>
                                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                      <Clock size={10} /> {formatDateTime(ticket.timestamp)}
                                  </div>
                              </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-3 mt-4">
                              {ticket.tags.map(tag => (
                                  <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[8px] font-black uppercase tracking-wider">{tag}</span>
                              ))}
                          </div>
                          {ticket.message && (
                              <div className="text-xs font-medium text-gray-600 bg-gray-50 p-3 rounded-xl italic line-clamp-3 mb-4">
                                  "{ticket.message}"
                              </div>
                          )}
                          <div className="pt-4 border-t flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                                      <UserIcon size={12} />
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-500 truncate max-w-[100px]">{ticket.userNameSnapshot}</span>
                              </div>
                              
                              {status === 'OPEN' && (
                                  <button onClick={() => handleTakeTicket(ticket.id)} className="text-[9px] font-black uppercase tracking-widest bg-primary text-white py-2 px-4 rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 flex items-center gap-1">
                                      Prendre <ArrowRight size={12} />
                                  </button>
                              )}
                              
                              {status === 'IN_PROGRESS' && ticket.assignedTo === user.id && (
                                  <button onClick={() => handleResolveClick(ticket)} className="text-[9px] font-black uppercase tracking-widest bg-success text-white py-2 px-4 rounded-xl hover:bg-success/90 transition-all shadow-md shadow-success/20 flex items-center gap-1">
                                      Résoudre <CheckSquare size={12} />
                                  </button>
                              )}
                              
                              {status === 'IN_PROGRESS' && ticket.assignedTo !== user.id && (
                                  <span className="text-[9px] font-black uppercase bg-gray-100 text-gray-400 py-1.5 px-3 rounded-lg">Pris par un autre</span>
                              )}
                          </div>
                      </div>
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
      </div>
      
      {loading && reports.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 animate-pulse font-black uppercase tracking-widest text-xs">
              Chargement des tickets...
          </div>
      ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden pb-10">
              {renderColumn('Ouverts', 'OPEN', <AlertTriangle size={18} strokeWidth={2.5}/>, 'text-danger')}
              {renderColumn('En cours', 'IN_PROGRESS', <Wrench size={18} strokeWidth={2.5}/>, 'text-warning')}
              {renderColumn('Résolus', 'RESOLVED', <ShieldCheck size={18} strokeWidth={2.5}/>, 'text-success')}
          </div>
      )}

      {resolvingTicket && activeChecklist && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-[600] flex items-end md:items-center justify-center p-0 md:p-6 animate-in fade-in flex-col">
            <div className="bg-white w-full max-w-lg rounded-t-[40px] md:rounded-[40px] p-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-slide-up relative flex flex-col max-h-[90vh]">
                <button onClick={() => { setResolvingTicket(null); setActiveChecklist(null); }} className="absolute top-8 right-8 text-gray-300 hover:text-dark transition-colors"><X size={28} /></button>
                <div className="mb-6">
                   <h2 className="text-2xl font-black text-dark tracking-tighter leading-none mb-2">Checklist de Maint.</h2>
                   <div className="flex gap-2 text-[10px] font-black text-warning uppercase tracking-[0.2em]">Résolution de ticket</div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="space-y-6 mb-8 mt-2">
                        {activeChecklist.items.map((item: any) => (
                            <div key={item.id} className="space-y-3">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    {item.label} {item.required && <span className="text-danger">*</span>}
                                </label>
                                
                                {item.type === 'BOOLEAN' ? (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setChecklistAnswers({...checklistAnswers, [item.id]: { value: true }})}
                                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${checklistAnswers[item.id]?.value === true ? 'bg-success text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100'}`}
                                        >OUI</button>
                                        <button 
                                            onClick={() => setChecklistAnswers({...checklistAnswers, [item.id]: { value: false }})}
                                            className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${checklistAnswers[item.id]?.value === false ? 'bg-danger text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100 hover:bg-gray-100'}`}
                                        >NON</button>
                                    </div>
                                ) : item.type === 'NUMBER' ? (
                                    <input 
                                        type="number" 
                                        placeholder="Saisissez une valeur..."
                                        value={checklistAnswers[item.id]?.value || ''}
                                        onChange={e => setChecklistAnswers({...checklistAnswers, [item.id]: { value: parseFloat(e.target.value) }})}
                                        className="w-full p-4 border-2 border-border rounded-2xl text-xs font-bold focus:border-primary outline-none"
                                    />
                                ) : (
                                    <input 
                                        type="text" 
                                        placeholder="Observation..."
                                        value={checklistAnswers[item.id]?.value || ''}
                                        onChange={e => setChecklistAnswers({...checklistAnswers, [item.id]: { value: e.target.value }})}
                                        className="w-full p-4 border-2 border-border rounded-2xl text-xs font-bold focus:border-primary outline-none"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3 mt-4 shrink-0">
                    <button onClick={() => { setResolvingTicket(null); setActiveChecklist(null); }} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl">Annuler</button>
                    <button onClick={handleSubmitChecklist} disabled={loading} className="flex-[2] py-4 bg-success text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-success/20 disabled:opacity-50 flex items-center justify-center gap-2"><CheckCircle size={16}/> Valider & Clore</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
