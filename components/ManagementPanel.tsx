import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { User, Equipment, Tenant, UserRole, WeeklySchedule, DaySchedule, Site } from '../types';
import { db } from '../services/db';
import { Plus, QrCode, RefreshCw, Printer, X, Download, User as UserIcon, Cog, Box, Database, Search, Check, ListChecks, MapPin } from 'lucide-react';
import { Logo } from './Logo';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ManagementPanelProps {
  user: User;
}

export const ManagementPanel: React.FC<ManagementPanelProps> = ({ user }) => {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [tenant, setTenant] = useState<Tenant | undefined>(undefined);
  
  const [activeTab, setActiveTab] = useState<'equipments' | 'users' | 'qrs' | 'checklists' | 'sites' | 'settings'>('equipments');
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  // Create / Edit Equipment
  const [eqName, setEqName] = useState('');
  const [eqType, setEqType] = useState('');
  const [eqSubType, setEqSubType] = useState('');
  const [eqBrand, setEqBrand] = useState('');
  const [eqModel, setEqModel] = useState('');
  const [eqSerialNumber, setEqSerialNumber] = useState('');
  const [eqUniqueId, setEqUniqueId] = useState('');
  const [eqIsBatch, setEqIsBatch] = useState(false);
  const [eqBatchQty, setEqBatchQty] = useState(1);
  const [eqInstructions, setEqInstructions] = useState('');
  
  const [eqCreateMultiple, setEqCreateMultiple] = useState(false);
  const [eqCreateMultipleQty, setEqCreateMultipleQty] = useState(1);
  
  const [eqUsageLimit, setEqUsageLimit] = useState<number | ''>('');
  const [eqMaintDays, setEqMaintDays] = useState<number | ''>('');
  const [eqIsKit, setEqIsKit] = useState(false);
  const [eqChildIds, setEqChildIds] = useState<string[]>([]);
  
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [editingSite, setEditingSite] = useState<Site | null>(null);

  const [editingEq, setEditingEq] = useState<Equipment | null>(null);

  // Users
  const [newUserFn, setNewUserFn] = useState('');
  const [newUserLn, setNewUserLn] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.AGENT);
  const [createdUser, setCreatedUser] = useState<User | null>(null);

  // Checklists
  const [chkName, setChkName] = useState('');
  const [chkTrigger, setChkTrigger] = useState<'USE'|'MAINTENANCE'>('USE');
  const [chkContext, setChkContext] = useState<'ALL'|'TYPE'|'SPECIFIC'>('ALL');
  const [chkValue, setChkValue] = useState('');
  const [chkItems, setChkItems] = useState<any[]>([]);
  const [editingChk, setEditingChk] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => { refreshData(); }, [user, showArchived, activeTab]);

  const refreshData = async () => {
    setLoading(true);
    try {
        const [eqs, usrs, tnt, chks, sts] = await Promise.all([
            db.getEquipments(user.tenantId, showArchived),
            db.getUsers(user.tenantId, true),
            db.getTenant(user.tenantId),
            db.getChecklists(user.tenantId, showArchived),
            db.getSites(user.tenantId, showArchived)
        ]);
        setEquipments((eqs as any).filter((e: any) => showArchived ? true : !e.isArchived));
        setUsers(usrs); 
        setTenant(tnt);
        setChecklists((chks as any).filter((c: any) => showArchived ? true : !c.isArchived));
        setSites((sts as any).filter((s: any) => showArchived ? true : s.status !== 'ARCHIVED'));
    } catch(e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName || !eqBrand) return;
    setLoading(true);
    try {
        if (editingEq) {
            await db.updateEquipment(editingEq.id, {
                name: eqName, type: eqType, subType: eqSubType, brand: eqBrand, 
                model: eqModel, serialNumber: eqSerialNumber, uniqueId: eqUniqueId, 
                isBatch: eqIsBatch, batchQuantity: eqIsBatch ? eqBatchQty : undefined,
                instructions: eqInstructions,
                usageCountBeforeMaintenance: eqUsageLimit !== '' ? Number(eqUsageLimit) : null as any,
                maintenanceIntervalDays: eqMaintDays !== '' ? Number(eqMaintDays) : null as any,
                isKit: eqIsKit, childEquipmentIds: eqIsKit ? eqChildIds : []
            }, user);
        } else {
            const baseEq = {
                name: eqName, type: eqType, subType: eqSubType, brand: eqBrand, 
                model: eqModel, serialNumber: eqSerialNumber, uniqueId: eqUniqueId, 
                isBatch: eqIsBatch, batchQuantity: eqIsBatch ? eqBatchQty : undefined,
                instructions: eqInstructions,
                usageCountBeforeMaintenance: eqUsageLimit !== '' ? Number(eqUsageLimit) : undefined,
                maintenanceIntervalDays: eqMaintDays !== '' ? Number(eqMaintDays) : undefined,
                nextMaintenanceDate: eqMaintDays !== '' ? new Date(Date.now() + Number(eqMaintDays)*86400000).toISOString() : undefined,
                isKit: eqIsKit, childEquipmentIds: eqIsKit ? eqChildIds : [],
                status: 'AVAILABLE' as const, usageCount: 0, isArchived: false
            };
            if (eqCreateMultiple && eqCreateMultipleQty > 1) {
                const items = [];
                for (let i = 0; i < eqCreateMultipleQty; i++) {
                    items.push({ ...baseEq, name: `${eqName} (${i + 1})` });
                }
                await db.createEquipmentBatch(user.tenantId, items);
            } else {
                await db.createEquipment(user.tenantId, baseEq);
            }
        }
        resetEqForm();
        await refreshData();
    } catch(e) {
        alert("Erreur lors de l'enregistrement de l'équipement");
    } finally {
        setLoading(false);
    }
  };

  const resetEqForm = () => {
      setEqName(''); setEqType(''); setEqSubType(''); setEqBrand(''); setEqModel(''); 
      setEqSerialNumber(''); setEqUniqueId(''); setEqIsBatch(false); setEqBatchQty(1); setEqInstructions('');
      setEqCreateMultiple(false); setEqCreateMultipleQty(1);
      setEqUsageLimit(''); setEqMaintDays(''); setEqIsKit(false); setEqChildIds([]);
      setEditingEq(null);
  };

  const editEquipment = (eq: Equipment) => {
      setEditingEq(eq);
      setEqName(eq.name); setEqType(eq.type || ''); setEqSubType(eq.subType || '');
      setEqBrand(eq.brand || ''); setEqModel(eq.model || ''); 
      setEqSerialNumber(eq.serialNumber || ''); setEqUniqueId(eq.uniqueId || '');
      setEqIsBatch(eq.isBatch || false); setEqBatchQty(eq.batchQuantity || 1);
      setEqInstructions(eq.instructions || '');
      setEqUsageLimit(eq.usageCountBeforeMaintenance || '');
      setEqMaintDays(eq.maintenanceIntervalDays || '');
      setEqIsKit(eq.isKit || false);
      setEqChildIds(eq.childEquipmentIds || []);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        const result = await db.createUser(user.tenantId, newUserFn, newUserLn, newUserEmail, newUserRole);
        setCreatedUser({...result, password: (result as any).password} as unknown as User);
        setNewUserFn(''); setNewUserLn(''); setNewUserEmail('');
        await refreshData();
    } catch (e: any) {
        alert(e.message || "Erreur de création utilisateur");
    } finally {
        setLoading(false);
    }
  };

  const resetSiteForm = () => { setSiteName(''); setSiteAddress(''); setEditingSite(null); };

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        if (editingSite) {
            await db.updateSite(user.tenantId, editingSite.id, { name: siteName, address: siteAddress });
        } else {
            await db.createSite(user.tenantId, { name: siteName, address: siteAddress });
        }
        resetSiteForm();
        await refreshData();
    } catch(e) {} finally { setLoading(false); }
  };
  
  const archiveSite = async (id: string) => {
      if(!confirm("Archiver ce chantier ?")) return;
      await db.archiveSite(user.tenantId, id);
      await refreshData();
  };
  
  const editSite = (s: Site) => {
      setEditingSite(s);
      setSiteName(s.name); setSiteAddress(s.address || '');
  };

  const checkArchiveEq = async (id: string) => {
      if(!confirm("Archiver cet équipement ?")) return;
      setLoading(true);
      try {
          await db.deleteEquipment(id, user); 
          await refreshData();
      } catch(e) {
      } finally {
          setLoading(false);
      }
  };

  const resetChkForm = () => {
    setChkName(''); setChkTrigger('USE'); setChkContext('ALL'); setChkValue(''); setChkItems([]); setEditingChk(null);
  };

  const handleSaveChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chkName || chkItems.length === 0) {
        alert("Un nom et au moins une étape sont requis.");
        return;
    }
    setLoading(true);
    try {
        const payload = {
            name: chkName,
            triggerType: chkTrigger,
            targetContext: chkContext,
            targetValue: chkContext === 'ALL' ? '' : chkValue,
            items: chkItems
        };
        if (editingChk) {
            await db.updateChecklist(user.tenantId, editingChk.id, payload);
        } else {
            await db.createChecklist(user.tenantId, payload);
        }
        resetChkForm();
        await refreshData();
    } catch(e) {
        alert("Erreur lors de l'enregistrement de la checklist");
    } finally {
        setLoading(false);
    }
  };

  const editChecklist = (c: any) => {
      setEditingChk(c);
      setChkName(c.name || ''); setChkTrigger(c.triggerType || 'USE'); setChkContext(c.targetContext || 'ALL'); setChkValue(c.targetValue || '');
      setChkItems(c.items || []);
  };

  const checkArchiveChk = async (id: string) => {
    if(!confirm("Archiver cette checklist ?")) return;
    setLoading(true);
    try {
        await db.archiveChecklist(user.tenantId, id);
        await refreshData();
    } catch(e) {} finally { setLoading(false); }
  };

  const handleDownloadPDF = async () => {
      const pages = document.querySelectorAll('.qr-page') as NodeListOf<HTMLElement>;
      if (!pages.length) return;
      
      setLoading(true);
      const doc = new jsPDF('p', 'mm', 'a4');
      
      for (let i = 0; i < pages.length; i++) {
          const clone = pages[i].cloneNode(true) as HTMLElement;
          clone.style.position = 'fixed'; clone.style.top = '0'; clone.style.left = '0';
          clone.style.width = '210mm'; clone.style.height = '297mm'; clone.style.zIndex = '-9999';
          document.body.appendChild(clone);
          
          try {
              await new Promise(r => setTimeout(r, 100));
              const canvas = await html2canvas(clone, { scale: 2, useCORS: true, logging: false });
              if (i > 0) doc.addPage();
              doc.addImage(canvas.toDataURL('image/jpeg', 0.90), 'JPEG', 0, 0, 210, 297);
          } finally {
              document.body.removeChild(clone);
          }
      }
      doc.save(`MIKI_QR_Codes.pdf`);
      setLoading(false);
  };

  // --- PRINT MODE ---
  if (isPrintMode) {
    const toPrint = equipments.filter(r => !r.isArchived);
    const pages = [];
    for (let i = 0; i < toPrint.length; i += 16) pages.push(toPrint.slice(i, i + 16));

    return (
      <div className="fixed inset-0 bg-gray-100 z-[5000] overflow-auto flex flex-col font-sans">
        <div className="print:hidden bg-dark text-white p-6 flex justify-between items-center sticky top-0 shadow-lg z-50">
          <div>
            <Logo light className="h-7" tenantLogoUrl={tenant?.logoUrl} />
            <p className="text-[10px] text-gray-400 font-black uppercase mt-1">{toPrint.length} codes ({pages.length} pages)</p>
          </div>
          <div className="flex gap-4 items-center">
             <button onClick={handleDownloadPDF} disabled={loading} className="bg-white text-dark px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex border"><Download size={16}/> TÉLÉCHARGER</button>
             <button onClick={() => window.print()} className="bg-primary text-white px-8 py-3 rounded-2xl text-[10px] border shadow-xl flex"><Printer size={16}/> IMPRIMER</button>
             <button onClick={() => setIsPrintMode(false)} className="bg-white/10 text-white px-6 py-3 rounded-2xl text-[10px] flex"><X size={16} /> FERMER</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-8">
            {pages.map((p, i) => (
                <div key={i} className="qr-page bg-white shadow-2xl p-[10mm] w-[210mm] h-[297mm] grid grid-cols-4 grid-rows-4 gap-0 content-start relative">
                {p.map(eq => (
                    <div key={eq.id} className="border border-gray-200 flex flex-col items-center justify-between pb-2 pt-4 px-2">
                        <div className="w-24 h-24 bg-white flex items-center justify-center">
                            <QRCode value={eq.qrCode} size={256} style={{ height: "100%", width: "100%" }} />
                        </div>
                        <div className="text-center mt-2 w-full">
                            <h2 className="text-xs font-black text-dark tracking-tight px-1 shrink-0 truncate">{eq.name}</h2>
                            <div className="text-gray-400 font-bold text-[7px] uppercase tracking-wider px-1 truncate">{eq.brand} - {eq.model}</div>
                        </div>
                    </div>
                ))}
                </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto pb-24 relative bg-background h-full overflow-y-auto no-scrollbar font-sans">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-10 gap-6">
        <div>
            <h2 className="text-2xl font-black text-dark tracking-tight mb-1">Gestion MIKI</h2>
            <p className="text-gray-400 text-sm font-medium">Administration du parc matériel et des utilisateurs.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-border">
            {[
              {id: 'equipments', label: 'ÉQUIPEMENTS', icon: <Box size={14}/>}, 
              {id: 'users', label: 'COMPTES', icon: <UserIcon size={14}/>}, 
              {id: 'qrs', label: 'QR CODES', icon: <QrCode size={14}/>},
              {id: 'checklists', label: 'CHECKLISTS', icon: <ListChecks size={14}/>},
              {id: 'sites', label: 'CHANTIERS', icon: <MapPin size={14}/>},
            ].map((t) => (
              <button 
                key={t.id} 
                onClick={() => { setActiveTab(t.id as any); resetEqForm(); }} 
                className={`flex gap-2 items-center px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === t.id ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}
              >
                 {t.icon} {t.label}
              </button>
            ))}
        </div>
      </div>

      <div className="mb-6 flex justify-end">
          <button onClick={() => setShowArchived(!showArchived)} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${showArchived ? 'bg-dark text-white' : 'bg-gray-100 text-gray-500'}`}>
              {showArchived ? 'Cacher archivés' : 'Voir archivés'}
          </button>
      </div>

      {activeTab === 'equipments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
                <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> {editingEq ? 'Modifier' : 'Ajouter'}</h3>
                <form onSubmit={handleSaveEquipment} className="space-y-4">
                    <input required placeholder="Nom (Ex: Perceuse #1)" value={eqName} onChange={e=>setEqName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                    <input required placeholder="Marque (Ex: Makita)" value={eqBrand} onChange={e=>setEqBrand(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                    <input placeholder="Modèle" value={eqModel} onChange={e=>setEqModel(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                    <div className="flex gap-2">
                        <input placeholder="Numéro de série" value={eqSerialNumber} onChange={e=>setEqSerialNumber(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                        <input placeholder="ID Unique / Interne" value={eqUniqueId} onChange={e=>setEqUniqueId(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                    </div>
                    
                    {!editingEq && !eqIsBatch && (
                        <div className="flex flex-col gap-2 p-4 border rounded-2xl bg-gray-50">
                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEqCreateMultiple(!eqCreateMultiple)}>
                                <input type="checkbox" checked={eqCreateMultiple} onChange={() => {}} className="w-5 h-5 accent-primary"/>
                                <span className="text-xs font-bold text-dark uppercase">Créer plusieurs exemplaires (Unitaires)</span>
                            </div>
                            {eqCreateMultiple && (
                                <input type="number" min="2" placeholder="Nombre d'exemplaires (ex: 24)" value={eqCreateMultipleQty} onChange={e=>setEqCreateMultipleQty(parseInt(e.target.value)||1)} className="w-full p-4 bg-primary/10 border-primary border rounded-2xl text-xs font-bold text-primary mt-2"/>
                            )}
                        </div>
                    )}

                    {!eqCreateMultiple && (
                        <>
                            <div className="flex items-center gap-3 p-4 border rounded-2xl bg-gray-50 cursor-pointer" onClick={() => setEqIsBatch(!eqIsBatch)}>
                                <input type="checkbox" checked={eqIsBatch} onChange={() => {}} className="w-5 h-5 accent-primary"/>
                                <span className="text-xs font-bold text-dark uppercase">Gérer en lot / quantité</span>
                            </div>

                            {eqIsBatch && (
                                <input type="number" min="1" placeholder="Quantité en stock" value={eqBatchQty} onChange={e=>setEqBatchQty(parseInt(e.target.value)||0)} className="w-full p-4 bg-primary/10 border-primary border rounded-2xl text-xs font-bold text-primary"/>
                            )}
                        </>
                    )}

                    <textarea placeholder="Consignes d'utilisation..." value={eqInstructions} onChange={e=>setEqInstructions(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold resize-none h-24"/>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 border rounded-2xl bg-gray-50 flex flex-col justify-center">
                            <label className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-2 block">Maintenance (Usages)</label>
                            <input type="number" min="1" placeholder="Ex: 50 usages" value={eqUsageLimit} onChange={e=>setEqUsageLimit(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 bg-transparent text-xs font-bold focus:outline-none"/>
                        </div>
                        <div className="p-4 border rounded-2xl bg-gray-50 flex flex-col justify-center">
                            <label className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-2 block">Maintenance (Jours)</label>
                            <input type="number" min="1" placeholder="Ex: 180 jours" value={eqMaintDays} onChange={e=>setEqMaintDays(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 bg-transparent text-xs font-bold focus:outline-none"/>
                        </div>
                    </div>

                    {!eqIsBatch && (
                    <div className="p-4 border rounded-2xl bg-gray-50">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEqIsKit(!eqIsKit)}>
                            <input type="checkbox" checked={eqIsKit} onChange={() => {}} className="w-5 h-5 accent-primary"/>
                            <span className="text-xs font-bold text-dark uppercase">Définir comme KIT (Contient du matériel)</span>
                        </div>
                        {eqIsKit && (
                            <div className="space-y-2 mt-4 pt-4 border-t">
                                <label className="text-[10px] font-black tracking-widest uppercase text-gray-400">Équipements inclus dans ce Kit</label>
                                <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                                    {equipments.filter(e => e.id !== editingEq?.id && !e.isBatch && !e.isKit).map(child => (
                                        <div key={child.id} className="flex gap-2 items-center">
                                            <input type="checkbox" checked={eqChildIds.includes(child.id)} onChange={(e) => {
                                                if (e.target.checked) setEqChildIds([...eqChildIds, child.id]);
                                                else setEqChildIds(eqChildIds.filter(id => id !== child.id));
                                            }} className="accent-primary" />
                                            <span className="text-xs font-medium">{child.name} <span className="text-gray-400">({child.brand})</span></span>
                                        </div>
                                    ))}
                                    {equipments.filter(e => e.id !== editingEq?.id && !e.isBatch && !e.isKit).length === 0 && (
                                        <div className="text-xs italic text-gray-400 font-medium">Aucun équipement unitaire disponible.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    <div className="flex gap-2">
                        {editingEq && <button type="button" onClick={resetEqForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>}
                        <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                    </div>
                </form>
            </div>
            <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                        <input 
                            placeholder="Rechercher un équipement..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-4 pl-12 bg-white border border-border rounded-2xl text-sm font-bold shadow-sm focus:border-primary"
                        />
                    </div>
                    <select 
                        value={filterType} 
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-white border border-border rounded-2xl p-4 text-xs font-bold shadow-sm focus:border-primary md:max-w-xs cursor-pointer"
                    >
                        <option value="ALL">Tous les types</option>
                        {Array.from(new Set(equipments.map(e => e.type).filter(Boolean))).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {equipments.filter(e => {
                        if (filterType !== 'ALL' && e.type !== filterType) return false;
                        const matchQ = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                       e.brand.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                       (e.serialNumber && e.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));
                        return matchQ;
                    }).map(eq => (
                        <div key={eq.id} className={`p-6 bg-white border rounded-[24px] shadow-sm flex flex-col justify-between ${eq.isArchived ? 'opacity-50 grayscale' : ''}`}>
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-black text-dark text-lg truncate pr-2">{eq.name}</h4>
                                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shrink-0 ${eq.status === 'AVAILABLE' ? 'bg-success/10 text-success' : eq.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
                                        {eq.status === 'AVAILABLE' ? 'DISPO' : eq.status === 'IN_USE' ? 'EMPRUNTÉ' : 'MAINTENANCE'}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{eq.brand} {eq.model}</p>
                                {(eq.serialNumber || eq.uniqueId) && (
                                    <div className="mb-4">
                                        {eq.serialNumber && <p className="text-[10px] font-bold text-dark uppercase">S/N: {eq.serialNumber}</p>}
                                        {eq.uniqueId && <p className="text-[10px] font-bold text-primary uppercase">ID: {eq.uniqueId}</p>}
                                    </div>
                                )}
                                {eq.isBatch && <span className="text-[10px] font-bold bg-primary/10 text-primary px-3 py-1 rounded-full uppercase mt-2 inline-block">Stock: {eq.batchQuantity}</span>}
                            </div>
                            <div className="flex justify-between items-center mt-6 pt-4 border-t">
                                <span className="text-[10px] font-bold text-gray-300">Usages: {eq.usageCount}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => editEquipment(eq)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Database size={16}/></button>
                                    {!eq.isArchived && <button onClick={() => checkArchiveEq(eq.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}
      {activeTab === 'checklists' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
                <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> {editingChk ? 'Modifier Checklist' : 'Nouvelle Checklist'}</h3>
                <form onSubmit={handleSaveChecklist} className="space-y-4">
                    <input required placeholder="Nom (Ex: Vérif. Sécurité Perceuse)" value={chkName} onChange={e=>setChkName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                    
                    <select required value={chkTrigger} onChange={e=>setChkTrigger(e.target.value as any)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary">
                        <option value="USE">À la Prise (Agent)</option>
                        <option value="MAINTENANCE">À la Résolution (Technicien)</option>
                    </select>

                    <select required value={chkContext} onChange={e=>setChkContext(e.target.value as any)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary">
                        <option value="ALL">Tout le parc</option>
                        <option value="TYPE">Par Type d'équipement</option>
                        <option value="SPECIFIC">Équipement spécifique</option>
                    </select>

                    {chkContext !== 'ALL' && (
                        <input required placeholder={chkContext === 'TYPE' ? "Quel Type ? (ex: Perceuse)" : "ID de l'équipement unique"} value={chkValue} onChange={e=>setChkValue(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary"/>
                    )}

                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-2">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Étapes ({chkItems.length})</h4>
                        </div>
                        {chkItems.map((item, i) => (
                            <div key={i} className="mb-4 bg-gray-50 p-2 rounded-xl relative border group focus-within:border-primary">
                                <button type="button" onClick={() => setChkItems(chkItems.filter((_, idx)=>idx!==i))} className="absolute -right-2 -top-2 bg-white text-danger border rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm"><X size={12}/></button>
                                <input required value={item.label} onChange={e => {
                                    const next = [...chkItems]; next[i].label = e.target.value; setChkItems(next);
                                }} placeholder="Question (ex: Le câble est-il intact ?)" className="w-full px-2 py-2 bg-transparent text-xs font-bold focus:outline-none mb-2" />
                                
                                <div className="flex items-center justify-between gap-2 px-2">
                                    <select value={item.type} onChange={e => {
                                        const next = [...chkItems]; next[i].type = e.target.value; setChkItems(next);
                                    }} className="bg-white border rounded border-gray-200 text-[10px] font-bold py-1 px-2">
                                        <option value="BOOLEAN">OUI/NON</option>
                                        <option value="TEXT">Texte</option>
                                        <option value="NUMBER">Nombre</option>
                                    </select>
                                    
                                    {item.type === 'BOOLEAN' && chkTrigger === 'USE' && (
                                        <div className="flex items-center gap-1 cursor-pointer" onClick={() => {
                                            const next = [...chkItems]; next[i].triggersIncidentIfFalse = !next[i].triggersIncidentIfFalse; setChkItems(next);
                                        }}>
                                            <input type="checkbox" checked={item.triggersIncidentIfFalse} onChange={()=>{}} className="accent-danger" />
                                            <span className="text-[9px] font-bold text-gray-400 uppercase">BLOQUANT (NON = TICKET)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <button type="button" onClick={() => setChkItems([...chkItems, { id: 's'+Date.now(), label: '', type: 'BOOLEAN', required: true, triggersIncidentIfFalse: false }])} className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-primary/50 hover:bg-primary/5 rounded-xl text-[10px] font-black tracking-widest uppercase text-gray-400 mt-2 transition-all">+ Ajouter une étape</button>
                    </div>

                    <div className="flex gap-2 pt-4">
                        {editingChk && <button type="button" onClick={resetChkForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>}
                        <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                    </div>
                </form>
            </div>
            
            <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {checklists.map(c => (
                        <div key={c.id} className={`p-6 bg-white border rounded-[24px] shadow-sm flex flex-col justify-between ${c.isArchived ? 'opacity-50 grayscale' : ''}`}>
                            <div>
                                <h4 className="font-black text-dark text-lg truncate pr-2">{c.name}</h4>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 mb-4 flex items-center gap-2">
                                    <span className={c.triggerType === 'USE' ? 'text-primary' : 'text-orange-500'}>
                                        {c.triggerType === 'USE' ? 'PRISE (AGENT)' : 'TICKET (TECH)'}
                                    </span>
                                    <span>•</span>
                                    <span>{c.targetContext === 'ALL' ? 'TOUT LE PARC' : c.targetContext === 'TYPE' ? `TYPE: ${c.targetValue}` : `EQ: ${c.targetValue}`}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mb-4">
                                {c.items?.map((it: any, i: number) => (
                                    <span key={i} className="text-[9px] font-black px-2 py-1 bg-gray-100 text-gray-500 rounded-lg shrink-0 truncate max-w-[150px] uppercase">
                                       {it.label}
                                       {it.triggersIncidentIfFalse && ' 🚨'}
                                    </span>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t">
                                <span className="text-[10px] font-bold text-gray-300">{c.items?.length || 0} étapes configurées</span>
                                <div className="flex gap-2">
                                    <button onClick={() => editChecklist(c)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Database size={16}/></button>
                                    {!c.isArchived && <button onClick={() => checkArchiveChk(c.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {checklists.length === 0 && (
                        <div className="col-span-full py-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] text-center">
                            <ListChecks size={48} className="mx-auto text-gray-300 mb-4 opacity-50"/>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aucun formulaire configuré</p>
                            <p className="text-dark/40 font-medium text-xs max-w-sm mx-auto mt-2">Créez des formulaires pour valider l'état du matériel lors de la prise ou après réparation.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {activeTab === 'sites' && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
                  <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><MapPin size={18} className="text-primary"/> {editingSite ? 'Modifier' : 'Nouveau'} Chantier</h3>
                  <form onSubmit={handleSaveSite} className="space-y-4">
                      <input required placeholder="Nom du Chantier" value={siteName} onChange={e=>setSiteName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                      <textarea placeholder="Adresse / Description" value={siteAddress} onChange={e=>setSiteAddress(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary resize-none h-24"/>
                      <div className="flex gap-2">
                          {editingSite && <button type="button" onClick={resetSiteForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>}
                          <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                      </div>
                  </form>
             </div>
             <div className="lg:col-span-2">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {sites.map(s => (
                         <div key={s.id} className={`bg-white border rounded-[24px] p-6 shadow-sm flex flex-col justify-between ${s.status === 'ARCHIVED' ? 'opacity-50' : ''}`}>
                             <div>
                                 <div className="flex items-center justify-between mb-2">
                                     <div className="flex items-center gap-2 max-w-[80%]">
                                        <MapPin size={16} className="text-primary shrink-0"/>
                                        <h4 className="font-black text-dark text-lg capitalize truncate">{s.name}</h4>
                                     </div>
                                     <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shrink-0 ${s.status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>
                                         {s.status === 'ACTIVE' ? 'ACTIF' : 'ARCHIVÉ'}
                                     </span>
                                 </div>
                                 <div className="text-gray-400 font-medium text-xs mb-4">{s.address || 'Aucune adresse spécifiée'}</div>
                                 
                                 <div className="bg-gray-50 p-3 rounded-xl border">
                                     <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex justify-between items-center">
                                        <span>Matériel Emprunté sur site</span>
                                        <span className="text-dark bg-white shadow-sm border px-2 py-0.5 rounded-md">{equipments.filter(e => e.siteId === s.id && e.status === 'IN_USE').length}</span>
                                     </div>
                                 </div>
                             </div>
                             <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                                <button onClick={() => editSite(s)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Database size={16}/></button>
                                {s.status !== 'ARCHIVED' && <button onClick={() => archiveSite(s.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                             </div>
                         </div>
                     ))}
                     {sites.length === 0 && (
                         <div className="col-span-full py-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] text-center">
                             <MapPin size={48} className="mx-auto text-gray-300 mb-4 opacity-50"/>
                             <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aucun chantier configuré</p>
                         </div>
                     )}
                 </div>
             </div>
         </div>
      )}


      {activeTab === 'users' && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
                  <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> Nouvel Utilisateur</h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                      <input required placeholder="Prénom" value={newUserFn} onChange={e=>setNewUserFn(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                      <input required placeholder="Nom" value={newUserLn} onChange={e=>setNewUserLn(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                      <input required type="email" placeholder="Email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                      <select value={newUserRole} onChange={e=>setNewUserRole(e.target.value as UserRole)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary">
                          <option value={UserRole.AGENT}>Agent (Utilisateur standard)</option>
                          <option value={UserRole.TECHNICIAN}>Technicien (Maintenance)</option>
                          <option value={UserRole.MANAGER}>Manager (Admin Local)</option>
                      </select>
                      <button type="submit" disabled={loading} className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Créer</button>
                  </form>
             </div>
             <div className="lg:col-span-2">
                 {createdUser && (
                     <div className="bg-success text-white p-6 rounded-[24px] mb-6 shadow-2xl animate-in zoom-in-95">
                         <h4 className="font-black uppercase tracking-widest text-xs mb-2 flex items-center gap-2"><Check size={16}/> Succès !</h4>
                         <p className="font-medium text-sm mb-4">L'utilisateur {createdUser.firstName} a été créé. Un changement de mot de passe sera exigé à la première connexion.</p>
                         <div className="bg-black/20 p-4 rounded-xl font-mono text-center text-lg tracking-widest">{createdUser.password}</div>
                         <button onClick={() => setCreatedUser(null)} className="w-full mt-4 bg-white text-success py-3 rounded-xl font-black text-[10px] uppercase">Fermer</button>
                     </div>
                 )}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {users.filter(u => showArchived ? true : !u.isArchived).map(u => (
                         <div key={u.id} className={`bg-white border rounded-[24px] p-6 shadow-sm ${u.isArchived ? 'opacity-50' : ''}`}>
                             <div className="flex justify-between items-start">
                                 <div>
                                     <div className="font-black text-dark text-lg capitalize">{u.firstName} {u.lastName}</div>
                                     <div className="text-gray-400 font-medium text-xs mb-2">{u.email}</div>
                                     <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                         {u.tenantsAccess?.[user.tenantId] || u.role}
                                     </span>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
         </div>
      )}

      {activeTab === 'qrs' && (
          <div className="flex flex-col items-center justify-center p-20 bg-white border border-border rounded-[32px] text-center shadow-sm">
             <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6"><QrCode size={48}/></div>
             <h3 className="text-xl font-black text-dark mb-2">Centre d'Impression QR</h3>
             <p className="text-gray-400 font-medium text-sm mb-8 max-w-sm">Générez et imprimez les étiquettes QR codes pour l'ensemble du matériel.</p>
             <button onClick={() => setIsPrintMode(true)} className="bg-primary text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-105 transition-all">
                Lancer l'impression
             </button>
          </div>
      )}
    </div>
  );
};
