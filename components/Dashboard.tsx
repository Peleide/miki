import React, { useEffect, useState, useMemo } from 'react';
import { User, EquipmentLog, Equipment, UserRole, Tenant, IncidentReport } from '../types';
import { db, TimeUtils } from '../services/db';
import { Download, Filter, Search, Calendar, ChevronLeft, ChevronRight, Activity, MessageSquare, AlertTriangle, Inbox, CheckSquare, Zap, Clock, ShieldCheck, Database, RefreshCw, TrendingUp, PieChart, Info, Settings2, Box, ArrowLeft, ClipboardList } from 'lucide-react';

interface DashboardProps {
  user: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'logs' | 'incidentReports' | 'equipments'>('metrics');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<'OPEN' | 'ARCHIVED'>('OPEN');
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const [filterStartDate, setFilterStartDate] = useState(todayStr); 
  const [filterEndDate, setFilterEndDate] = useState(todayStr); 

  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [incidentReports, setReports] = useState<IncidentReport[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const isManager = user.role === UserRole.MANAGER || user.role === UserRole.ADMIN;
  const isClient = user.role === UserRole.CLIENT;
  const timezone = currentTenant?.timezone || 'Europe/Paris';

  const loadData = async () => {
      setIsLoading(true);
      try {
        let range = undefined;
        if (filterStartDate && filterEndDate) {
            const addDays = (d: string, days: number) => {
                const date = new Date(d);
                date.setDate(date.getDate() + days);
                return date.toISOString().slice(0, 10);
            };
            range = { start: addDays(filterStartDate, -1), end: addDays(filterEndDate, 1) };
        }

        const [l, eq, u, t, rep, mLogs, chks] = await Promise.all([
            db.getEquipmentLogs(user.tenantId, user.role, 500, range), 
            db.getEquipments(user.tenantId),
            db.getUsers(user.tenantId),
            db.getTenant(user.tenantId),
            db.getIncidentReports(user.tenantId, reportStatusFilter),
            db.getMaintenanceLogs(user.tenantId),
            db.getChecklists(user.tenantId)
        ]);
        
        setLogs(l); 
        setEquipments(eq as any[]); 
        setTenantUsers(u); 
        setCurrentTenant(t || null);
        setReports(rep);
        setMaintenanceLogs(mLogs);
        setChecklists(chks);
      } catch (err) {
        console.error("Dashboard load error", err);
      } finally {
        setIsLoading(false);
      }
  };

  useEffect(() => { loadData(); }, [user.tenantId, reportStatusFilter]);
  useEffect(() => { if (filterStartDate && filterEndDate && (activeTab === 'logs' || activeTab === 'metrics')) loadData(); }, [filterStartDate, filterEndDate, activeTab]);

  const shiftDate = (dateStr: string, days: number) => {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    date.setDate(date.getDate() + days);
    
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleArchiveReport = async (reportId: string) => {
      try {
          await db.archiveReport(user.tenantId, reportId, user);
          setReports(prev => prev.filter(r => r.id !== reportId));
      } catch (e) { 
          alert("Erreur lors de l'archivage."); 
      }
  };

  // MTTR & Utilization Calculation
  const metrics = useMemo(() => {
    const totalEq = equipments.length;
    const availableEq = equipments.filter(e => e.status === 'AVAILABLE').length;
    const inUseEq = equipments.filter(e => e.status === 'IN_USE').length;
    const maintenanceEq = equipments.filter(e => e.status === 'MAINTENANCE').length;

    // Calcul MTTR approximé basé sur les logs
    // On cherche les séquences REPORT -> TAKE_FOR_MAINTENANCE -> RETURN
    // Pour une version V1, on peut simplement afficher des KPIs basiques.
    const takes = logs.filter(l => l.action === 'TAKE');
    const returns = logs.filter(l => l.action === 'RETURN');
    const interventions = logs.filter(l => l.action === 'INTERVENTION');

    return {
        totalEq, availableEq, inUseEq, maintenanceEq,
        takeCount: takes.length,
        returnCount: returns.length,
        interventionCount: interventions.length,
        utilizationRate: totalEq > 0 ? Math.round((inUseEq / totalEq) * 100) : 0
    };
  }, [equipments, logs]);

  const formatTime = (ts: any) => ts ? TimeUtils.formatInTimezone(ts, timezone, { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const formatDateBrief = (ts: any) => ts ? TimeUtils.formatInTimezone(ts, timezone, { day: '2-digit', month: '2-digit' }) : '--/--';
  const formatFullDateTime = (ts: any) => ts ? TimeUtils.formatInTimezone(ts, timezone, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--/--/---- --:--';

  const getActionColor = (action: string) => {
      switch(action) {
          case 'TAKE': return 'text-primary bg-primary/10';
          case 'RETURN': return 'text-success bg-success/10';
          case 'REPORT': return 'text-danger bg-danger/10';
          case 'INTERVENTION': return 'text-warning bg-warning/10 border-warning';
          default: return 'text-gray-500 bg-gray-100';
      }
  };

  const getActionLabel = (action: string) => {
      switch(action) {
          case 'TAKE': return 'Emprunté';
          case 'RETURN': return 'Restitué';
          case 'REPORT': return 'Signalement';
          case 'INTERVENTION': return 'Maintenance';
          default: return action;
      }
  };

  return (
    <div className="flex flex-col h-full bg-background font-sans overflow-hidden">
      <div className="p-4 sm:p-5 bg-white border-b border-border z-[100] shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-3 shrink-0">
             <div className="flex gap-2 p-1 bg-gray-50 border border-gray-100 rounded-[20px] overflow-x-auto no-scrollbar">
                <button onClick={() => {setActiveTab('metrics'); setSelectedEquipment(null);}} className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'metrics' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Activity size={16}/> Vue d'ensemble
                </button>
                <button onClick={() => {setActiveTab('equipments'); setSelectedEquipment(null);}} className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'equipments' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Box size={16}/> Objets & Suivi
                </button>
                <button onClick={() => {setActiveTab('logs'); setSelectedEquipment(null);}} className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'logs' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Database size={16}/> Historique Global
                </button>
                <button onClick={() => {setActiveTab('incidentReports'); setSelectedEquipment(null);}} className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'incidentReports' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <AlertTriangle size={16}/> Tickets {incidentReports.filter(r=>r.status==='OPEN').length > 0 && <span className="bg-danger text-white px-1.5 py-0.5 rounded-md text-[8px]">{incidentReports.filter(r=>r.status==='OPEN').length}</span>}
                </button>
             </div>
          </div>

          <div className="hidden lg:flex flex-1 items-center justify-center gap-3">
             {activeTab === 'incidentReports' ? (
                <div className="flex bg-gray-50 p-1 rounded-full border border-gray-200">
                    <button onClick={() => setReportStatusFilter('OPEN')} className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${reportStatusFilter === 'OPEN' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-dark'}`}>Ouverts</button>
                    <button onClick={() => setReportStatusFilter('ARCHIVED')} className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${reportStatusFilter === 'ARCHIVED' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-dark'}`}>Archivés</button>
                </div>
             ) : (
                <div className="relative flex items-center gap-1">
                    <button onClick={() => setFilterStartDate(shiftDate(filterStartDate, -1)) || setFilterEndDate(shiftDate(filterEndDate, -1))} className="p-2 text-gray-300 hover:text-primary transition-colors"><ChevronLeft size={24} /></button>
                    <div className="bg-white border border-border px-6 py-2.5 rounded-full text-sm font-black text-dark tabular-nums tracking-tighter shadow-sm">
                        {filterStartDate === filterEndDate ? new Date(filterStartDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : `${filterStartDate} - ${filterEndDate}`}
                    </div>
                    <button onClick={() => setFilterStartDate(shiftDate(filterStartDate, 1)) || setFilterEndDate(shiftDate(filterEndDate, 1))} className="p-2 text-gray-300 hover:text-primary transition-colors"><ChevronRight size={24} /></button>
                </div>
             )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button 
              onClick={loadData} 
              disabled={isLoading} 
              className="bg-white text-dark p-2.5 sm:px-4 sm:py-3 rounded-xl border border-border hover:bg-gray-50 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw size={18} className={`transition-all ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4 sm:p-10 no-scrollbar">
        <div className="max-w-7xl mx-auto">
            {isLoading && (logs.length === 0 && equipments.length === 0) ? (
               <div className="py-20 text-center text-gray-300 animate-pulse font-black uppercase tracking-widest text-[10px]">Chargement...</div>
            ) : (
              <>
              {activeTab === 'metrics' && (
                  <div className="space-y-8 animate-in fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-white p-6 rounded-[32px] border border-border flex flex-col items-center justify-center shadow-sm">
                              <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Parc Total</span>
                              <span className="text-5xl font-black text-dark tracking-tighter">{metrics.totalEq}</span>
                          </div>
                          <div className="bg-white p-6 rounded-[32px] border border-border flex flex-col items-center justify-center shadow-sm">
                              <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Taux d'utilisation</span>
                              <span className="text-5xl font-black text-primary tracking-tighter">{metrics.utilizationRate}%</span>
                          </div>
                          <div className="bg-white p-6 rounded-[32px] border border-border flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
                              <span className="text-[10px] font-black uppercase text-orange-400 tracking-widest mb-2">En Service</span>
                              <span className="text-5xl font-black text-orange-500 tracking-tighter">{metrics.inUseEq}</span>
                              <div className="absolute inset-x-0 bottom-0 h-1 bg-orange-500"></div>
                          </div>
                          <div className="bg-white p-6 rounded-[32px] border border-border flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
                              <span className="text-[10px] font-black uppercase text-danger tracking-widest mb-2">En Maintenance</span>
                              <span className="text-5xl font-black text-danger tracking-tighter">{metrics.maintenanceEq}</span>
                              <div className="absolute inset-x-0 bottom-0 h-1 bg-danger"></div>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                          <div className="bg-white p-8 rounded-[40px] border border-border shadow-sm">
                              <h3 className="font-black text-dark uppercase tracking-widest text-xs mb-6 flex items-center gap-2"><TrendingUp size={16} className="text-primary"/> Flux Opérationnel (Période)</h3>
                              <div className="space-y-4">
                                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                                      <span className="font-bold text-gray-600">Emprunts (TAKE)</span>
                                      <span className="font-black p-2 bg-white rounded-xl min-w-[3rem] text-center border shadow-sm">{metrics.takeCount}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl">
                                      <span className="font-bold text-gray-600">Restitutions (RETURN)</span>
                                      <span className="font-black p-2 bg-white rounded-xl min-w-[3rem] text-center border shadow-sm">{metrics.returnCount}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-4 bg-warning/10 rounded-2xl border border-warning/20">
                                      <span className="font-bold text-warning">Interventions (MAINTENANCE)</span>
                                      <span className="font-black p-2 bg-white rounded-xl min-w-[3rem] text-center text-warning border shadow-sm">{metrics.interventionCount}</span>
                                  </div>
                              </div>
                          </div>

                          <div className="bg-white p-8 rounded-[40px] border border-border shadow-sm">
                              <h3 className="font-black text-dark uppercase tracking-widest text-xs mb-6 flex items-center gap-2"><Settings2 size={16} className="text-primary"/> État du parc (Temps réel)</h3>
                              <div className="space-y-4">
                                  {equipments.slice(0, 5).map(eq => (
                                      <div key={eq.id} className="flex justify-between items-center p-4 border rounded-2xl">
                                          <div>
                                              <div className="font-black text-sm">{eq.name}</div>
                                              <div className="text-[9px] font-black uppercase text-gray-400">{eq.brand} • {eq.model}</div>
                                          </div>
                                          <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${eq.status === 'AVAILABLE' ? 'bg-success/10 text-success' : eq.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
                                              {eq.status}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'logs' && (
                  <div className="bg-white border border-border rounded-[40px] overflow-hidden shadow-sm animate-in fade-in">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-border">
                              <tr>
                                <th className="px-10 py-7">Action</th>
                                <th className="px-10 py-7">Matériel</th>
                                <th className="px-10 py-7">Utilisateur</th>
                                <th className="px-10 py-7 text-right">Date / Heure</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                              {logs.map(log => (
                                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors group">
                                      <td className="px-10 py-5">
                                          <div className={`inline-block px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${getActionColor(log.action)}`}>
                                              {getActionLabel(log.action)}
                                          </div>
                                      </td>
                                      <td className="px-10 py-5">
                                          <div className="font-black text-dark">{log.equipmentNameSnapshot}</div>
                                      </td>
                                      <td className="px-10 py-5">
                                          <div className="font-medium text-gray-600 bg-gray-50 border px-3 py-1 rounded-lg inline-block text-xs">
                                              {log.userNameSnapshot}
                                          </div>
                                      </td>
                                      <td className="px-10 py-5 text-right">
                                          <div className="font-black tabular-nums">{formatTime(log.timestamp)}</div>
                                          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{formatDateBrief(log.timestamp)}</div>
                                      </td>
                                  </tr>
                              ))}
                              {logs.length === 0 && (
                                  <tr><td colSpan={4} className="text-center py-20 text-gray-400 uppercase font-black text-xs tracking-widest">Aucun historique pour cette période</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              )}

              {activeTab === 'incidentReports' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
                      {incidentReports.length === 0 ? (
                          <div className="col-span-full py-20 text-center text-gray-300 font-black uppercase tracking-widest text-[10px]">
                            <div className="flex flex-col items-center gap-4">
                                <div className="bg-gray-100 p-8 rounded-[40px] text-gray-200"><Inbox size={64}/></div>
                                <span>Aucun ticket {reportStatusFilter === 'OPEN' ? 'ouvert' : 'archivé'}</span>
                            </div>
                          </div>
                      ) : (
                          incidentReports.map(rep => (
                              <div key={rep.id} className="bg-white p-8 rounded-[32px] border border-border shadow-sm flex flex-col gap-4 group hover:shadow-xl transition-all duration-300 relative overflow-hidden">
                                  {reportStatusFilter === 'ARCHIVED' && <div className="absolute top-0 right-0 p-2 bg-gray-50 text-[8px] font-black uppercase tracking-widest text-gray-300 rounded-bl-xl border-l border-b border-gray-100">Clôturé</div>}
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <div className="font-black text-dark text-lg group-hover:text-primary transition-colors">{rep.equipmentNameSnapshot}</div>
                                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{rep.userNameSnapshot} • {formatFullDateTime(rep.timestamp)}</div>
                                      </div>
                                      {isManager && reportStatusFilter === 'OPEN' && (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); handleArchiveReport(rep.id); }} 
                                            className="bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all p-3 rounded-2xl border border-primary/10 shadow-sm" 
                                            title="Clôturer le ticket"
                                          >
                                            <CheckSquare size={20}/>
                                          </button>
                                      )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                      {rep.tags.map(tag => (
                                          <span key={tag} className="px-3 py-1 bg-warning/10 text-warning border border-warning/20 rounded-lg text-[9px] font-black uppercase tracking-wider">{tag}</span>
                                      ))}
                                  </div>
                                  {rep.message && <div className="text-sm font-medium text-gray-600 bg-gray-50 p-4 rounded-2xl italic leading-relaxed border border-gray-100 shadow-inner">"{rep.message}"</div>}
                              </div>
                          ))
                      )}
                  </div>
              )}

              {activeTab === 'equipments' && (
                  <div className="animate-in fade-in">
                      {!selectedEquipment ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {equipments.map(eq => (
                                  <div 
                                    key={eq.id} 
                                    onClick={() => setSelectedEquipment(eq)}
                                    className="bg-white p-6 rounded-[32px] border border-border shadow-sm flex flex-col gap-2 cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all group"
                                  >
                                      <div className="flex justify-between items-start">
                                          <div className="bg-gray-50 p-3 rounded-2xl text-gray-400 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                                              <Box size={24}/>
                                          </div>
                                          <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${eq.status === 'AVAILABLE' ? 'bg-success/10 text-success' : eq.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
                                              {eq.status}
                                          </div>
                                      </div>
                                      <div className="mt-4">
                                          <h3 className="font-black text-dark group-hover:text-primary transition-colors line-clamp-2">{eq.name}</h3>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">{eq.brand} • {eq.model}</p>
                                      </div>
                                  </div>
                              ))}
                              {equipments.length === 0 && (
                                  <div className="col-span-full py-20 text-center text-gray-400 text-xs font-black uppercase tracking-widest">
                                      Aucun objet répertorié.
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="space-y-6">
                              <button 
                                onClick={() => setSelectedEquipment(null)}
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-primary transition-colors"
                              >
                                  <ArrowLeft size={16}/> Retour aux objets
                              </button>

                              <div className="bg-white p-8 rounded-[40px] border border-border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                  <div>
                                      <div className="flex items-center gap-3 mb-2">
                                        <h2 className="text-2xl font-black text-dark">{selectedEquipment.name}</h2>
                                        <div className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${selectedEquipment.status === 'AVAILABLE' ? 'bg-success/10 text-success' : selectedEquipment.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
                                            {selectedEquipment.status}
                                        </div>
                                      </div>
                                      <p className="text-xs font-black uppercase tracking-widest text-gray-400">{selectedEquipment.brand} • {selectedEquipment.model} • ID: {selectedEquipment.uniqueId}</p>
                                  </div>
                                  <div className="flex gap-4">
                                      <div className="bg-gray-50 px-6 py-4 rounded-3xl border border-gray-100 text-center">
                                          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Usages</div>
                                          <div className="text-2xl font-black text-dark">{selectedEquipment.usageCount}</div>
                                      </div>
                                      <div className="bg-gray-50 px-6 py-4 rounded-3xl border border-gray-100 text-center">
                                          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Proch. Maintenance</div>
                                          <div className="text-sm font-black text-dark mt-2">{selectedEquipment.nextMaintenanceDate ? TimeUtils.formatInTimezone(selectedEquipment.nextMaintenanceDate, timezone, { dateStyle: 'short' }) : '-'}</div>
                                      </div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Maintenance Checklists */}
                                  <div className="bg-white rounded-[32px] p-6 shadow-sm border border-border">
                                      <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex items-center gap-2"><ClipboardList size={18} className="text-primary"/> Checklists & Maintenances</h3>
                                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                                          {maintenanceLogs.filter(m => m.equipmentId === selectedEquipment.id).map(m => (
                                              <div key={m.id} className="p-4 border rounded-2xl flex flex-col gap-3 bg-gray-50/50">
                                                  <div className="flex justify-between items-start">
                                                      <div>
                                                          <div className="font-black text-sm text-dark">{m.checklistNameSnapshot}</div>
                                                          <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Par: {m.userNameSnapshot}</div>
                                                      </div>
                                                      <span className="px-2 py-1 bg-white border text-gray-500 text-[9px] font-black rounded-lg uppercase tracking-widest">
                                                          {TimeUtils.formatInTimezone(m.timestamp, timezone, { dateStyle: 'short', timeStyle: 'short' })}
                                                      </span>
                                                  </div>
                                                  {m.answers && Object.entries(m.answers).length > 0 && (
                                                      <div className="grid grid-cols-1 gap-2 mt-2 bg-white p-3 rounded-xl border">
                                                          {Object.entries(m.answers).map(([key, val]: any, i) => (
                                                              <div key={i} className="flex gap-2 text-[11px]">
                                                                  <span className="font-bold text-gray-600 truncate flex-1">{checklists.find(c => c.items?.find((it:any) => it.id === key))?.items?.find((it:any) => it.id === key)?.label || 'Question'}:</span>
                                                                  <span className="font-black text-dark truncate flex-1 text-right">{val.value !== undefined ? String(val.value) : 'N/A'}</span>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                                  {m.generalNote && (
                                                      <div className="text-xs italic text-gray-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                                                          Note: {m.generalNote}
                                                      </div>
                                                  )}
                                              </div>
                                          ))}
                                          {maintenanceLogs.filter(m => m.equipmentId === selectedEquipment.id).length === 0 && (
                                              <div className="py-12 text-center text-gray-400 font-black uppercase tracking-widest text-[10px]">
                                                  Aucune maintenance enregistrée.
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Routine Logs */}
                                  <div className="bg-white rounded-[32px] p-6 shadow-sm border border-border">
                                      <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex items-center gap-2"><Database size={18} className="text-primary"/> Historique des mouvements</h3>
                                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                                          {logs.filter(l => l.equipmentId === selectedEquipment.id).map(log => (
                                              <div key={log.id} className="flex justify-between items-center p-4 border rounded-2xl hover:bg-gray-50/50 transition-colors">
                                                  <div className="flex items-center gap-4">
                                                      <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                                          log.action === 'TAKE' ? 'bg-primary/10 text-primary' :
                                                          log.action === 'RETURN' ? 'bg-success/10 text-success' :
                                                          log.action === 'REPORT' ? 'bg-danger/10 text-danger' :
                                                          'bg-gray-100 text-gray-600'
                                                      }`}>
                                                          {log.action}
                                                      </div>
                                                      <div>
                                                          <div className="font-black text-xs text-dark">{log.userNameSnapshot}</div>
                                                          <div className="text-[10px] text-gray-400 font-medium">
                                                              {TimeUtils.formatInTimezone(log.timestamp, timezone, { dateStyle: 'short', timeStyle: 'short' })}
                                                          </div>
                                                      </div>
                                                  </div>
                                              </div>
                                          ))}
                                          {logs.filter(l => l.equipmentId === selectedEquipment.id).length === 0 && (
                                              <div className="py-12 text-center text-gray-400 font-black uppercase tracking-widest text-[10px]">
                                                  Aucun mouvement enregistré.
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              )}
              </>
            )}
        </div>
      </div>
    </div>
  );
};