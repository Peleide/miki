import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Equipment, EquipmentLogAction, UserRole } from '../types';
import { db } from '../services/db';
import { CheckCircle, MapPin, LogIn, LogOut, AlertTriangle, X, Loader2, RefreshCw, Check, LayoutGrid, ChevronDown, Wrench, Package, Box } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface AgentViewProps {
  user: User;
  isOnline: boolean;
  onModeChange?: (mode: 'scan' | 'list') => void;
  onRefreshUser: () => Promise<void>;
}

export const AgentView: React.FC<AgentViewProps> = ({ user, isOnline, onModeChange, onRefreshUser }) => {
  const savedMode = localStorage.getItem('miki_agent_mode') as 'scan' | 'list' | null;
  const [mode, setMode] = useState<'scan' | 'list'>(savedMode || 'list');
  
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedEq, setSelectedEq] = useState<Equipment | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  const [isReportingMode, setIsReportingMode] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportTags, setReportTags] = useState<string[]>([]);
  
  const [takeQuantity, setTakeQuantity] = useState(1);

  const isSelectedEqRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedQrCodeRef = useRef<string | null>(null);
  
  const minScanInterval = 600; 

  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRegionId = "html5-qrcode-reader";
  
  const activeSessionEquipmentId = user.activeEquipmentId || null;

  const REPORT_TAGS = ['Panne', 'Casse', 'Pièce manquante', 'Révision nécessaire', 'Autre'];

  useEffect(() => {
    loadEquipments();
    onModeChange?.(mode);
  }, [user.tenantId, user.id]);

  useEffect(() => {
    return () => { cleanupScanner(); };
  }, [mode]);

  const startScanner = async () => {
    try {
      setScannerError(null);
      await new Promise(r => setTimeout(r, 300));
      if (!document.getElementById(scannerRegionId)) return;
      if (scannerRef.current) await cleanupScanner();
      
      const scanner = new Html5Qrcode(scannerRegionId);
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: "environment" },
        { 
          fps: 10, 
          qrbox: (viewWidth, viewHeight) => {
            const size = Math.min(viewWidth, viewHeight) * 0.7;
            return { width: size, height: size };
          },
          aspectRatio: 1.0 
        },
        (decodedText) => { handleScanSuccess(decodedText); },
        () => {} 
      );
    } catch (err) { 
      setScannerError("La caméra est inaccessible. Vérifiez les autorisations."); 
    }
  };

  useEffect(() => {
    if (mode === 'scan') startScanner();
  }, [mode]);

  const cleanupScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.warn("Cleanup scanner error", e);
      }
      scannerRef.current = null;
    }
  };

  const handleModeChange = (newMode: 'scan' | 'list') => {
    setMode(newMode);
    localStorage.setItem('miki_agent_mode', newMode);
    setSelectedEq(null);
    isSelectedEqRef.current = false;
    lastScannedQrCodeRef.current = null;
    onModeChange?.(newMode);
  };

  const handleScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if (isSelectedEqRef.current || (now - lastScanTimeRef.current < minScanInterval)) return;
    if (!decodedText.startsWith('MIKI_')) return;
    
    const eq = equipments.find(e => e.qrCode === decodedText);
    if (eq) {
      if (navigator.vibrate) navigator.vibrate(50);
      isSelectedEqRef.current = true;
      lastScanTimeRef.current = now;
      lastScannedQrCodeRef.current = decodedText; 
      
      setShowSuccessFlash(true);
      setTimeout(() => setShowSuccessFlash(false), 1200);

      setSelectedEq(eq);
      setIsReportingMode(false);
      setReportMessage('');
      setReportTags([]);
      setTakeQuantity(1);
    }
  };

  const closeModal = () => {
    setSelectedEq(null);
    isSelectedEqRef.current = false;
    lastScannedQrCodeRef.current = null;
    setTakeQuantity(1);
  };

  const [checklists, setChecklists] = useState<any[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<any>(null);
  const [checklistAnswers, setChecklistAnswers] = useState<any>({});
  
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');

  const loadEquipments = async () => {
    setLoading(true);
    try {
      const [eqs, chks, sts] = await Promise.all([
          db.getEquipments(user.tenantId),
          db.getChecklists(user.tenantId),
          db.getSites(user.tenantId)
      ]);
      setEquipments(eqs);
      setChecklists(chks);
      const activeSites = (sts as any).filter((s:any) => s.status === 'ACTIVE');
      setSites(activeSites);
      if (activeSites.length > 0) setSelectedSiteId(activeSites[0].id);
    } catch (e) { console.error("Load error", e); } finally { setLoading(false); }
  };

  const handleAction = async (action: EquipmentLogAction) => {
    if (!selectedEq || loading) return;

    if (action === 'TAKE' && activeSessionEquipmentId && !selectedEq.isBatch) {
      const otherEq = equipments.find(r => r.id === activeSessionEquipmentId);
      alert(`Vous utilisez déjà "${otherEq?.name || 'un autre équipement'}". Veuillez le restituer d'abord.`);
      return;
    }

    if (action === 'TAKE' && !activeChecklist) {
        const matches = checklists.filter(c => 
            c.triggerType === 'USE' && !c.isArchived &&
            (c.targetContext === 'ALL' || 
             (c.targetContext === 'TYPE' && c.targetValue === selectedEq.type) ||
             (c.targetContext === 'SPECIFIC' && c.targetValue === selectedEq.id))
        );
        if (matches.length > 0) {
            setActiveChecklist(matches[0]);
            setChecklistAnswers({});
            return;
        }
    }

    setLoading(true);
    try {
      const capturedQrCode = lastScannedQrCodeRef.current;
      await db.processEquipmentScan(selectedEq.id, action, user, { 
          validationQr: capturedQrCode || undefined, 
          quantity: selectedEq.isBatch ? takeQuantity : 1,
          siteId: action === 'TAKE' ? selectedSiteId : undefined
      }); 

      if (action === 'TAKE' && activeChecklist) {
          await db.submitChecklistAnswers(user.tenantId, {
              equipmentId: selectedEq.id,
              checklistId: activeChecklist.id,
              answers: checklistAnswers,
              equipmentNameSnapshot: selectedEq.name,
              checklistNameSnapshot: activeChecklist.name,
          });
      }
      
      setLastAction(`Action validée : ${action === 'TAKE' ? 'Prise' : 'Restitution'}`);
      await onRefreshUser();
      await loadEquipments();
      setTimeout(() => setLastAction(null), 3000);
      closeModal();
      setActiveChecklist(null);
    } catch (e: any) { 
      alert(e.message || "Erreur lors de l'enregistrement."); 
    } finally { 
      setLoading(false); 
    }
  };
  
  const handleSubmitChecklist = async () => {
      for (const item of activeChecklist.items) {
          if (item.required && (checklistAnswers[item.id]?.value === undefined || checklistAnswers[item.id]?.value === '')) {
              alert(`Veuillez répondre à: ${item.label}`);
              return;
          }
      }

      let failedItem = null;
      for (const item of activeChecklist.items) {
          if (item.type === 'BOOLEAN' && item.triggersIncidentIfFalse && checklistAnswers[item.id]?.value === false) {
              failedItem = item;
              break;
          }
      }

      if (failedItem) {
          setIsReportingMode(true);
          setReportMessage(`Checklist KO: ${failedItem.label}`);
          setReportTags(['Panne']);
          setActiveChecklist(null);
          return;
      }

      await handleAction('TAKE');
  };

  const handleSendReport = async () => {
     if (!selectedEq || (!reportMessage && reportTags.length === 0)) return;
     setLoading(true);
     try {
         await db.createIncidentReport({
             tenantId: user.tenantId,
             equipmentId: selectedEq.id,
             userId: user.id,
             message: reportMessage,
             tags: reportTags,
             priority: 'MEDIUM',
             type: 'BREAKDOWN'
         }, user);
         
         await db.processEquipmentScan(selectedEq.id, 'REPORT', user, { userNote: reportMessage });
         
         setLastAction("Signalement envoyé.");
         await onRefreshUser();
         await loadEquipments();
         setTimeout(() => setLastAction(null), 3000);
         closeModal();
     } catch (e) {
         alert("Erreur envoi signalement.");
     } finally {
         setLoading(false);
     }
  };
  
  const toggleReportTag = (tag: string) => {
      if (reportTags.includes(tag)) setReportTags(reportTags.filter(t => t !== tag));
      else setReportTags([...reportTags, tag]);
  };

  const getBrands = () => {
      const brands = equipments.map(e => e.brand).filter(Boolean);
      return Array.from(new Set(brands)).sort();
  };

  const filteredEqs = useMemo(() => {
      return selectedBrand === 'ALL' 
          ? equipments 
          : equipments.filter(e => e.brand === selectedBrand);
  }, [equipments, selectedBrand]);

  const isUserActiveHere = selectedEq?.id === activeSessionEquipmentId;
  const isUserActiveElsewhere = !!activeSessionEquipmentId && !isUserActiveHere;

  return (
    <div className="p-4 max-w-lg mx-auto pb-10 h-full flex flex-col bg-background">
      {lastAction && (
        <div className="fixed top-20 left-4 right-4 bg-success text-white p-4 rounded-2xl shadow-2xl z-[500] animate-bounce flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest">
          <CheckCircle size={20} /> {lastAction}
        </div>
      )}

      {activeSessionEquipmentId && (
        <div className="border p-4 rounded-2xl mb-6 flex items-center justify-between gap-3 shadow-sm bg-primary/10 border-primary/30 text-primary">
           <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-ping"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                {`En cours : ${equipments.find(e => e.id === activeSessionEquipmentId)?.name || 'Équipement'}`}
              </span>
           </div>
        </div>
      )}

      <div className="flex bg-white rounded-2xl p-1 mb-4 shadow-sm border border-border shrink-0">
        <button onClick={() => handleModeChange('list')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${mode === 'list' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400'}`}>Liste</button>
        <button onClick={() => handleModeChange('scan')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${mode === 'scan' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400'}`}>Scanner</button>
      </div>

      {mode === 'list' && (
          <div className="relative mb-6">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Package className="text-primary" size={18} />
              </div>
              <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full appearance-none bg-white border border-border rounded-2xl py-4 pl-12 pr-10 text-sm font-black text-dark outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
              >
                  <option value="ALL">Toutes les marques</option>
                  {getBrands().map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <ChevronDown className="text-gray-400" size={20} />
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {mode === 'scan' ? (
          <div className="h-full flex flex-col bg-dark rounded-[32px] overflow-hidden relative shadow-2xl min-h-[350px]">
             <div id={scannerRegionId} className="w-full h-full"></div>
             
             {showSuccessFlash && (
               <div className="absolute inset-0 bg-success/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center animate-in fade-in duration-300">
                 <div className="bg-white p-6 rounded-full shadow-2xl scale-125 animate-bounce">
                    <Check size={48} className="text-success" strokeWidth={4} />
                 </div>
                 <p className="text-white font-black text-sm uppercase tracking-[0.2em] mt-8 drop-shadow-lg">Identifié</p>
               </div>
             )}

             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-4">
                <button 
                  onClick={startScanner} 
                  className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-4 rounded-full text-white transition-all border border-white/10 shadow-xl"
                >
                  <RefreshCw size={24} />
                </button>
             </div>

             {scannerError && (
               <div className="absolute inset-0 flex items-center justify-center bg-dark/95 p-8 text-center z-30 backdrop-blur-md">
                 <div className="text-danger">
                   <AlertTriangle size={48} className="mx-auto mb-4" />
                   <p className="font-black text-xs uppercase tracking-widest leading-relaxed">{scannerError}</p>
                   <div className="flex flex-col gap-3 mt-8">
                    <button onClick={startScanner} className="bg-primary text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                      <RefreshCw size={14} /> Relancer Caméra
                    </button>
                    <button onClick={() => handleModeChange('list')} className="bg-white/10 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">Retour liste</button>
                   </div>
                 </div>
               </div>
             )}
          </div>
        ) : (
          <div className="space-y-4 pb-4">
             {loading && equipments.length === 0 && <div className="text-center text-gray-300 py-10 font-black uppercase tracking-widest text-[10px] animate-pulse">Chargement...</div>}
             
             {filteredEqs.length === 0 && !loading && (
                 <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                     <div className="bg-gray-100 p-6 rounded-full"><LayoutGrid size={32} className="text-gray-400"/></div>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aucun équipement</p>
                 </div>
             )}

             <div className="grid grid-cols-1 gap-4">
               {filteredEqs.map(eq => {
                 const isActiveHere = eq.id === activeSessionEquipmentId;
                 return (
                  <button
                    key={eq.id}
                    disabled={loading}
                    onClick={() => { setSelectedEq(eq); isSelectedEqRef.current = true; }}
                    className={`w-full p-5 rounded-[24px] border transition-all text-left flex justify-between items-center active:scale-[0.98] relative overflow-hidden ${isActiveHere ? 'bg-white border-primary border-2 shadow-xl shadow-primary/10' : 'bg-white border-border hover:border-gray-300 shadow-sm'}`}
                  >
                    {isActiveHere && (
                        <>
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-75 animate-pulse"></div>
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-primary shadow-[0_0_20px_2px_rgba(123,184,243,0.8)]"></div>
                        </>
                    )}
                    <div className="flex-1 pr-4 relative z-10">
                      <div className={`font-black text-base tracking-tight mb-1 ${isActiveHere ? 'text-primary' : 'text-dark'}`}>{eq.name}</div>
                      <div className="flex items-center gap-2">
                        {isActiveHere ? (
                          <span className="text-primary font-black uppercase tracking-widest text-[9px] flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                              En cours d'utilisation
                          </span>
                        ) : eq.status === 'MAINTENANCE' ? (
                          <span className="text-danger font-bold text-[10px] uppercase tracking-widest">En maintenance</span>
                        ) : eq.status === 'IN_USE' ? (
                          <span className="text-orange-500 font-bold text-[10px] uppercase tracking-widest">Emprunté</span>
                        ) : (
                          <span className="text-gray-300 font-bold text-[10px] uppercase tracking-widest">Disponible</span>
                        )}
                        {eq.isBatch && (
                            <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[9px] font-black ml-2">Stock: {eq.batchQuantity}</span>
                        )}
                      </div>
                    </div>
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all relative z-10 ${isActiveHere ? 'bg-primary text-white shadow-lg shadow-primary/20 rotate-12' : 'bg-gray-50 text-gray-300'}`}>
                      {eq.status === 'MAINTENANCE' ? <Wrench size={24} className="text-danger"/> : <Box size={24} />}
                    </div>
                  </button>
                 );
               })}
             </div>
          </div>
        )}
      </div>

      {selectedEq && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-[600] flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-slide-up relative flex flex-col max-h-[90vh]">
            <button onClick={closeModal} className="absolute top-8 right-8 text-gray-300 hover:text-dark transition-colors"><X size={28} /></button>
            <div className="mb-8">
                <h2 className="text-2xl font-black text-dark tracking-tighter leading-none mb-2 flex items-center gap-3">
                    {selectedEq.name}
                    {selectedEq.isKit && (
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest flex items-center gap-1 shrink-0">
                          <Box size={14} className="mb-0.5"/> KIT
                        </span>
                    )}
                </h2>
                <div className="flex gap-2 text-[10px] font-black text-primary uppercase tracking-[0.2em]">{selectedEq.brand} - {selectedEq.model}</div>
            </div>
            
            {isReportingMode ? (
                <div className="flex-1 overflow-y-auto no-scrollbar animate-in slide-in-from-right">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Type de problème</label>
                            <div className="flex flex-wrap gap-2">
                                {REPORT_TAGS.map(tag => (
                                    <button 
                                        key={tag} 
                                        onClick={() => toggleReportTag(tag)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${reportTags.includes(tag) ? 'bg-dark text-white border-dark' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Message (Détails)</label>
                            <textarea 
                                value={reportMessage}
                                onChange={e => setReportMessage(e.target.value)}
                                className="w-full h-32 p-4 border-2 border-border rounded-2xl text-sm font-medium focus:border-primary outline-none resize-none"
                                placeholder="..."
                            />
                        </div>
                        <div className="pt-2 gap-3 flex">
                            <button onClick={() => setIsReportingMode(false)} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl">Annuler</button>
                            <button onClick={handleSendReport} disabled={loading || (reportTags.length === 0 && !reportMessage)} className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 disabled:opacity-50">Valider</button>
                        </div>
                    </div>
                </div>
            ) : activeChecklist ? (
                <div className="flex-1 overflow-y-auto no-scrollbar animate-in slide-in-from-bottom">
                    <div className="bg-primary/10 border border-primary/20 p-6 rounded-[24px] mb-8">
                        <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2 mb-2"><CheckCircle size={16}/> {activeChecklist.name}</h3>
                        <p className="text-primary/70 font-bold text-[10px] uppercase tracking-widest">Une vérification est requise avant la prise de cet équipement.</p>
                    </div>
                    
                    <div className="space-y-6 mb-8">
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

                    <div className="flex gap-3">
                        <button onClick={() => setActiveChecklist(null)} className="flex-1 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl">Annuler</button>
                        <button onClick={handleSubmitChecklist} disabled={loading} className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 disabled:opacity-50">Valider & Prendre</button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto no-scrollbar animate-in slide-in-from-left">
                    {selectedEq.isKit && (
                        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-start gap-4">
                            <Box size={24} className="text-primary mt-0.5 shrink-0"/>
                            <div>
                                <h4 className="text-[13px] font-black text-primary tracking-tight">Kit complet</h4>
                                <p className="text-[11px] text-primary/70 mt-1 font-bold leading-relaxed">Emprunter ce kit inclut automatiquement tous ses composants ({selectedEq.childEquipmentIds?.length || 0} éléments).</p>
                            </div>
                        </div>
                    )}
                    <div className="bg-gray-50 border border-gray-100 text-gray-500 p-6 rounded-[24px] text-sm mb-8 leading-relaxed font-medium italic">
                        {selectedEq.instructions || "Aucune consigne d'utilisation spécifique."}
                    </div>
                    
                    {selectedEq.isBatch && activeSessionEquipmentId !== selectedEq.id && (
                        <div className="mb-6 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantité concernée</label>
                            <input 
                                type="number" 
                                min={1} 
                                max={Math.max(1, selectedEq.batchQuantity || 1)}
                                value={takeQuantity}
                                onChange={(e) => setTakeQuantity(parseInt(e.target.value) || 1)}
                                className="w-full p-4 border-2 border-border rounded-2xl text-base font-black focus:border-primary focus:outline-none"
                            />
                        </div>
                    )}
                    
                    {(!isUserActiveElsewhere || selectedEq.isBatch) && (selectedEq.status === 'AVAILABLE' || selectedEq.isBatch) && sites.length > 0 && (
                        <div className="mb-6 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Chantier (Destination)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-primary"><MapPin size={18}/></div>
                                <select 
                                    value={selectedSiteId}
                                    onChange={(e) => setSelectedSiteId(e.target.value)}
                                    className="w-full appearance-none bg-white border-2 border-border rounded-2xl py-4 pl-12 pr-10 text-sm font-black text-dark outline-none focus:border-primary transition-all shadow-sm"
                                >
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400"><ChevronDown size={20}/></div>
                            </div>
                        </div>
                    )}
                    
                    <div className="space-y-4">
                      {isUserActiveElsewhere && !selectedEq.isBatch ? (
                          <div className="p-6 bg-red-50 rounded-3xl border border-red-100 text-center">
                              <AlertTriangle className="mx-auto text-danger mb-2" size={32}/>
                              <div className="font-black text-danger text-sm mb-1">Un équipement déjà en cours</div>
                              <p className="text-xs text-gray-500 mb-4">Restituez d'abord l'équipement que vous utilisez.</p>
                          </div>
                      ) : isUserActiveHere ? (
                        <button 
                          disabled={loading}
                          onClick={() => handleAction('RETURN')}
                          className="w-full py-5 bg-dark text-white font-black rounded-[24px] shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4 text-xs uppercase tracking-[0.2em] disabled:opacity-50"
                        >
                          {loading ? <Loader2 size={24} className="animate-spin" /> : <LogOut size={24} />} 
                          Restituer
                        </button>
                      ) : selectedEq.status === 'AVAILABLE' || selectedEq.isBatch ? (
                        <button 
                          disabled={loading || (selectedEq.isBatch && (selectedEq.batchQuantity || 0) <= 0)}
                          onClick={() => handleAction('TAKE')}
                          className="w-full py-5 bg-primary text-white font-black rounded-[24px] shadow-2xl shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-4 text-xs uppercase tracking-[0.2em] disabled:opacity-50"
                        >
                          {loading ? <Loader2 size={24} className="animate-spin" /> : <LogIn size={24} />} 
                          {selectedEq.isBatch && (selectedEq.batchQuantity || 0) <= 0 ? 'Rupture de stock' : 'Prendre l\'équipement'}
                        </button>
                      ) : (
                          <div className="p-6 bg-orange-50 rounded-3xl border border-orange-100 text-center">
                              <AlertTriangle className="mx-auto text-orange-500 mb-2" size={32}/>
                              <div className="font-black text-orange-600 text-sm mb-1">Non disponible</div>
                              <p className="text-xs text-orange-400 mb-4">Cet équipement est actuellement {selectedEq.status === 'IN_USE' ? 'emprunté par un autre agent' : 'en maintenance'}.</p>
                          </div>
                      )}

                      <button onClick={() => setIsReportingMode(true)} className="w-full py-4 text-gray-400 font-black text-[10px] uppercase tracking-widest bg-white border border-border rounded-2xl hover:bg-red-50 hover:text-danger hover:border-red-100 transition-colors flex items-center justify-center gap-2">
                         <AlertTriangle size={16}/> Signaler un problème
                      </button>

                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};