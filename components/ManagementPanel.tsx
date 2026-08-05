import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { User, Equipment, Tenant, UserRole, WeeklySchedule, DaySchedule, Site, EquipmentType, CdilUnit, VisitSession, VisitEntry } from '../types';
import { db } from '../services/db';
import { Plus, QrCode, RefreshCw, Printer, X, Download, User as UserIcon, Box, Pencil, Search, Check, ListChecks, MapPin, KeyRound, Power, ClipboardList, Droplets, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Logo } from './Logo';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useDialog } from '../hooks/useDialog';

interface ManagementPanelProps {
  user: User;
}

export const ManagementPanel: React.FC<ManagementPanelProps> = ({ user }) => {
  const { confirm, toast, dialogNode } = useDialog();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [tenant, setTenant] = useState<Tenant | undefined>(undefined);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  
  const [activeTab, setActiveTab] = useState<'equipments' | 'users' | 'qrs' | 'checklists' | 'sites' | 'centrales'>('equipments');
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  // Create / Edit Equipment
  const [eqName, setEqName] = useState('');
  const [eqCategory, setEqCategory] = useState('');
  const [eqCategoryCode, setEqCategoryCode] = useState('');
  const [eqStorageLocation, setEqStorageLocation] = useState('');
  const [eqType, setEqType] = useState('');
  const [eqSubType, setEqSubType] = useState('');
  const [eqBrand, setEqBrand] = useState('');
  const [eqModel, setEqModel] = useState('');
  const [eqSerialNumber, setEqSerialNumber] = useState('');
  const [eqUniqueId, setEqUniqueId] = useState('');
  const [eqIsBatch, setEqIsBatch] = useState(false);
  const [eqBatchQty, setEqBatchQty] = useState(1);
  const [eqInstructions, setEqInstructions] = useState('');
  // New type management
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCode, setNewTypeCode] = useState('');
  
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
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);
  const [resetPwdResult, setResetPwdResult] = useState<{ userId: string; tempPassword: string } | null>(null);

  // CDil Units
  const [cdilUnits, setCdilUnits] = useState<CdilUnit[]>([]);
  const [cdilSessions, setCdilSessions] = useState<VisitSession[]>([]);
  const [cdilLoading, setCdilLoading] = useState(false);
  const [cdilSerial, setCdilSerial] = useState('');
  const [cdilLocation, setCdilLocation] = useState('');
  const [cdilService, setCdilService] = useState('');
  const [cdilRoomCode, setCdilRoomCode] = useState('');
  const [cdilNotes, setCdilNotes] = useState('');
  const [editingCdilUnit, setEditingCdilUnit] = useState<CdilUnit | null>(null);

  // Checklists
  const [chkName, setChkName] = useState('');
  const [chkTrigger, setChkTrigger] = useState<'USE'|'MAINTENANCE'>('USE');
  const [chkContext, setChkContext] = useState<'ALL'|'TYPE'|'SPECIFIC'>('ALL');
  const [chkValue, setChkValue] = useState('');
  const [chkItems, setChkItems] = useState<any[]>([]);
  const [editingChk, setEditingChk] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [eqPage, setEqPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const EQ_PAGE_SIZE = 12;
  const USERS_PAGE_SIZE = 12;

  useEffect(() => { setEqPage(1); }, [searchQuery, filterType, showArchived]);
  useEffect(() => { setUsersPage(1); }, [showArchived]);

  useEffect(() => { refreshData(); }, [user, showArchived, activeTab]);

  const refreshData = async () => {
    setLoading(true);
    try {
        const [eqs, usrs, tnt, chks, sts, types] = await Promise.all([
            db.getEquipments(user.tenantId, showArchived),
            db.getUsers(user.tenantId, true),
            db.getTenant(user.tenantId),
            db.getChecklists(user.tenantId, showArchived),
            db.getSites(user.tenantId, showArchived),
            db.getEquipmentTypes(user.tenantId),
        ]);
        setEquipments((eqs as any).filter((e: any) => showArchived ? true : !e.isArchived));
        setUsers(usrs);
        setTenant(tnt);
        setChecklists((chks as any).filter((c: any) => showArchived ? true : !c.isArchived));
        setSites((sts as any).filter((s: any) => showArchived ? true : s.status !== 'ARCHIVED'));
        setEquipmentTypes(types);
    } catch(e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEq && (!eqCategoryCode || !eqStorageLocation)) return;
    if (editingEq && !eqName) return;
    setLoading(true);
    try {
        if (editingEq) {
            await db.updateEquipment(editingEq.id, {
                name: eqName, category: eqCategory, categoryCode: eqCategoryCode,
                storageLocation: eqStorageLocation,
                type: eqCategory || eqType, subType: eqSubType, brand: eqBrand,
                model: eqModel, serialNumber: eqSerialNumber, uniqueId: eqUniqueId,
                isBatch: eqIsBatch, batchQuantity: eqIsBatch ? eqBatchQty : undefined,
                instructions: eqInstructions,
                usageCountBeforeMaintenance: eqUsageLimit !== '' ? Number(eqUsageLimit) : null as any,
                maintenanceIntervalDays: eqMaintDays !== '' ? Number(eqMaintDays) : null as any,
                isKit: eqIsKit, childEquipmentIds: eqIsKit ? eqChildIds : []
            }, user);
        } else {
            const baseEq = {
                category: eqCategory, categoryCode: eqCategoryCode,
                storageLocation: eqStorageLocation,
                type: eqCategory || eqType, subType: eqSubType, brand: eqBrand,
                model: eqModel, serialNumber: eqSerialNumber, uniqueId: eqUniqueId,
                isBatch: eqIsBatch, batchQuantity: eqIsBatch ? eqBatchQty : undefined,
                instructions: eqInstructions,
                usageCountBeforeMaintenance: eqUsageLimit !== '' ? Number(eqUsageLimit) : undefined,
                maintenanceIntervalDays: eqMaintDays !== '' ? Number(eqMaintDays) : undefined,
                nextMaintenanceDate: eqMaintDays !== '' ? new Date(Date.now() + Number(eqMaintDays)*86400000).toISOString() : undefined,
                isKit: eqIsKit, childEquipmentIds: eqIsKit ? eqChildIds : [],
                status: 'AVAILABLE' as const, usageCount: 0, isArchived: false,
                name: '', // server will generate
            };
            if (eqCreateMultiple && eqCreateMultipleQty > 1) {
                const items = Array.from({ length: eqCreateMultipleQty }, () => ({ ...baseEq }));
                await db.createEquipmentBatch(user.tenantId, items);
            } else {
                await db.createEquipment(user.tenantId, baseEq);
            }
        }
        resetEqForm();
        await refreshData();
    } catch(e) {
        toast("Erreur lors de l'enregistrement de l'équipement");
    } finally {
        setLoading(false);
    }
  };

  const handleAddEquipmentType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName || !newTypeCode) return;
    setLoading(true);
    try {
        await db.manageEquipmentType('CREATE', user.tenantId, { name: newTypeName, code: newTypeCode });
        setNewTypeName(''); setNewTypeCode(''); setShowAddType(false);
        const types = await db.getEquipmentTypes(user.tenantId);
        setEquipmentTypes(types);
    } catch(e) {
        toast("Erreur lors de l'ajout du type");
    } finally {
        setLoading(false);
    }
  };

  const resetEqForm = () => {
      setEqName(''); setEqCategory(''); setEqCategoryCode(''); setEqStorageLocation('');
      setEqType(''); setEqSubType(''); setEqBrand(''); setEqModel('');
      setEqSerialNumber(''); setEqUniqueId(''); setEqIsBatch(false); setEqBatchQty(1); setEqInstructions('');
      setEqCreateMultiple(false); setEqCreateMultipleQty(1);
      setEqUsageLimit(''); setEqMaintDays(''); setEqIsKit(false); setEqChildIds([]);
      setEditingEq(null);
  };

  const editEquipment = (eq: Equipment) => {
      setEditingEq(eq);
      setEqName(eq.name);
      setEqCategory(eq.category || eq.type || '');
      setEqCategoryCode(eq.categoryCode || '');
      setEqStorageLocation(eq.storageLocation || '');
      setEqType(eq.type || ''); setEqSubType(eq.subType || '');
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
        toast(e.message || "Erreur de création utilisateur");
    } finally {
        setLoading(false);
    }
  };

  const handleResetUserPwd = async (targetUserId: string) => {
    const ok = await confirm({ title: 'Réinitialiser le mot de passe', message: "Un nouveau mot de passe provisoire sera généré. L'utilisateur devra le changer à sa prochaine connexion.", confirmLabel: 'Réinitialiser', variant: 'warning' });
    if (!ok) return;
    setUserActionLoading(targetUserId);
    try {
        const result = await db.managerResetPassword(targetUserId, user);
        if (result.tempPassword) setResetPwdResult({ userId: targetUserId, tempPassword: result.tempPassword });
    } catch (e: any) {
        toast(e.message || 'Erreur lors de la réinitialisation');
    } finally {
        setUserActionLoading(null);
    }
  };

  const handleToggleDisable = async (u: User) => {
    const action = u.isDisabled ? 'réactiver' : 'désactiver';
    const ok = await confirm({ title: u.isDisabled ? 'Réactiver ce compte' : 'Désactiver ce compte', message: `Voulez-vous ${action} ${u.firstName} ${u.lastName} ?`, confirmLabel: u.isDisabled ? 'Réactiver' : 'Désactiver', variant: u.isDisabled ? 'default' : 'danger' });
    if (!ok) return;
    setUserActionLoading(u.id);
    try {
        await db.managerUpdateUser(user.tenantId, u.id, { isDisabled: !u.isDisabled }, user);
        await refreshData();
    } catch (e: any) {
        toast(e.message || 'Erreur lors de la modification');
    } finally {
        setUserActionLoading(null);
    }
  };

  // CDil handlers
  const refreshCdilData = async () => {
    setCdilLoading(true);
    try {
      const [units, sessions] = await Promise.all([
        db.getCdilUnits(user.tenantId),
        db.getVisitSessions(user.tenantId, 'CDIL'),
      ]);
      setCdilUnits(units);
      setCdilSessions(sessions);
    } catch (e) { console.error(e); }
    finally { setCdilLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'centrales') refreshCdilData();
  }, [activeTab, user.tenantId]);

  const handleCreateCdilUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cdilSerial || !cdilLocation || !cdilService) return;
    setCdilLoading(true);
    try {
      await db.createCdilUnit(user.tenantId, {
        serialNumber: cdilSerial, location: cdilLocation,
        service: cdilService, roomCode: cdilRoomCode, notes: cdilNotes,
      });
      setCdilSerial(''); setCdilLocation(''); setCdilService(''); setCdilRoomCode(''); setCdilNotes('');
      await refreshCdilData();
    } catch (e: any) { toast(e.message || 'Erreur'); }
    finally { setCdilLoading(false); }
  };

  const editCdilUnit = (unit: CdilUnit) => {
    setEditingCdilUnit(unit);
    setCdilSerial(unit.serialNumber);
    setCdilLocation(unit.location);
    setCdilService(unit.service);
    setCdilRoomCode(unit.roomCode || '');
    setCdilNotes(unit.notes || '');
  };

  const cancelEditCdilUnit = () => {
    setEditingCdilUnit(null);
    setCdilSerial(''); setCdilLocation(''); setCdilService(''); setCdilRoomCode(''); setCdilNotes('');
  };

  const handleUpdateCdilUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCdilUnit) return;
    setCdilLoading(true);
    try {
      await db.updateCdilUnit(user.tenantId, editingCdilUnit.id, {
        serialNumber: cdilSerial, location: cdilLocation,
        service: cdilService, roomCode: cdilRoomCode, notes: cdilNotes,
      });
      cancelEditCdilUnit();
      await refreshCdilData();
    } catch (e: any) { toast(e.message || 'Erreur'); }
    finally { setCdilLoading(false); }
  };

  const handleDeactivateCdilUnit = async (id: string) => {
    const ok = await confirm({ title: 'Désactiver cette unité', message: 'Cette unité ne sera plus incluse dans les prochaines visites.', confirmLabel: 'Désactiver', variant: 'danger' });
    if (!ok) return;
    try {
      await db.deactivateCdilUnit(user.tenantId, id);
      await refreshCdilData();
    } catch (e: any) { toast(e.message || 'Erreur'); }
  };

  const exportCdilSessionCsv = (session: VisitSession) => {
    const typeLabel = session.sessionType === 'INTERVENTION' ? 'Intervention inopinée' : 'Visite périodique';
    const headers = ['Date', 'Type de visite', 'Technicien', 'Localisation', 'Service', 'N° Série', 'Buse', 'Crépine', 'Ligne aspiration', 'Remarques'];
    const rows = session.entries.map((e: VisitEntry) => [
      session.date, typeLabel, session.technicianName, e.location, e.service,
      e.serialNumber, String(e.buse), String(e.crepine), String(e.ligne), e.remarks || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `CDil_${session.title.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
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
      const ok = await confirm({ title: 'Archiver ce chantier', message: 'Ce chantier sera archivé et ne sera plus visible par défaut.', confirmLabel: 'Archiver', variant: 'danger' });
      if (!ok) return;
      await db.archiveSite(user.tenantId, id);
      await refreshData();
  };
  
  const editSite = (s: Site) => {
      setEditingSite(s);
      setSiteName(s.name); setSiteAddress(s.address || '');
  };

  const checkArchiveEq = async (id: string) => {
      const ok = await confirm({ title: 'Archiver cet équipement', message: 'Cet équipement sera archivé. Son historique sera conservé.', confirmLabel: 'Archiver', variant: 'danger' });
      if (!ok) return;
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
        toast("Un nom et au moins une étape sont requis.");
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
        toast("Erreur lors de l'enregistrement de la checklist");
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
    const ok = await confirm({ title: 'Archiver cette checklist', message: 'Cette checklist ne sera plus proposée lors des opérations.', confirmLabel: 'Archiver', variant: 'danger' });
    if (!ok) return;
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
                            {eq.uniqueId && <div className="text-primary font-black text-[8px] uppercase tracking-wider px-1 mt-0.5 truncate">ID: {eq.uniqueId}</div>}
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
              {id: 'checklists', label: 'CHECKLISTS', icon: <ListChecks size={14}/>},
              {id: 'qrs', label: 'QR CODES', icon: <QrCode size={14}/>},
              {id: 'sites', label: 'CHANTIERS', icon: <MapPin size={14}/>},
              {id: 'centrales', label: 'CENTRALES', icon: <Droplets size={14}/>},
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
              {editingEq ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-4">
                  <Pencil size={28} className="text-primary opacity-40"/>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modification en cours</p>
                  <p className="text-xs font-medium text-gray-300 max-w-[160px]">Le formulaire est déployé directement sur la carte.</p>
                  <button onClick={resetEqForm} className="mt-2 px-6 py-3 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500 hover:bg-gray-200 transition-all">Annuler</button>
                </div>
              ) : (
              <>
                <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> Ajouter</h3>
                <form onSubmit={handleSaveEquipment} className="space-y-4">
                    {/* Catégorie */}
                    <div>
                        <select
                            required={!editingEq}
                            value={eqCategoryCode}
                            onChange={e => {
                                const t = equipmentTypes.find(t => t.code === e.target.value);
                                setEqCategoryCode(e.target.value);
                                setEqCategory(t?.name || '');
                            }}
                            className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"
                        >
                            <option value="">Catégorie *</option>
                            {equipmentTypes.map(t => <option key={t.id} value={t.code}>{t.name} ({t.code})</option>)}
                        </select>
                        <button type="button" onClick={() => setShowAddType(!showAddType)} className="mt-1 text-[10px] font-black text-primary/60 hover:text-primary uppercase tracking-widest">
                            {showAddType ? '– Annuler' : '+ Ajouter un type'}
                        </button>
                    </div>

                    {/* Ajout d'un type personnalisé */}
                    {showAddType && (
                        <form onSubmit={handleAddEquipmentType} className="p-4 border-2 border-dashed border-primary/30 rounded-2xl bg-primary/5 space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Nouveau type</p>
                            <input required placeholder="Nom (ex: Aspirateur)" value={newTypeName} onChange={e=>setNewTypeName(e.target.value)} className="w-full p-3 bg-white border rounded-xl text-xs font-bold focus:border-primary focus:outline-none"/>
                            <input required placeholder="Code court (ex: Asp)" value={newTypeCode} onChange={e=>setNewTypeCode(e.target.value)} className="w-full p-3 bg-white border rounded-xl text-xs font-bold focus:border-primary focus:outline-none"/>
                            <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Créer</button>
                        </form>
                    )}

                    {/* Local de stockage */}
                    <input required={!editingEq} placeholder="Local de stockage * (ex: Dépôt A)" value={eqStorageLocation} onChange={e=>setEqStorageLocation(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>

                    {/* Nomenclature preview */}
                    {!editingEq && eqCategoryCode && eqStorageLocation && (
                        <div className="px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Nom auto-généré</p>
                            <p className="text-sm font-black text-primary">{eqCategoryCode}___{new Date().toISOString().slice(0,7).replace('-','')}_{eqStorageLocation}</p>
                            <p className="text-[9px] text-gray-400 mt-1">Le numéro de séquence sera attribué par le serveur.</p>
                        </div>
                    )}

                    {/* Nom (édition uniquement) */}
                    {editingEq && (
                        <input required placeholder="Nom" value={eqName} onChange={e=>setEqName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                    )}

                    <input placeholder="Marque (ex: Tennant)" value={eqBrand} onChange={e=>setEqBrand(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                    <input placeholder="Modèle" value={eqModel} onChange={e=>setEqModel(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                    <div className="flex gap-2">
                        <input placeholder="Numéro de série" value={eqSerialNumber} onChange={e=>setEqSerialNumber(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
                        <input placeholder="N° de référence" value={eqUniqueId} onChange={e=>setEqUniqueId(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold"/>
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
                        <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                    </div>
                </form>
              </>
              )}
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
                {(() => {
                    const filteredEqs = equipments.filter(e => {
                        if (filterType !== 'ALL' && e.type !== filterType) return false;
                        return e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                               e.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                               (e.serialNumber && e.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));
                    });
                    const eqTotalPages = Math.ceil(filteredEqs.length / EQ_PAGE_SIZE);
                    const displayEqs = editingEq ? filteredEqs : filteredEqs.slice((eqPage - 1) * EQ_PAGE_SIZE, eqPage * EQ_PAGE_SIZE);
                    return (<>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayEqs.map(eq => (
                        editingEq?.id === eq.id ? (
                        <div key={eq.id} className="md:col-span-2 bg-white border-2 border-primary/20 rounded-[24px] shadow-sm p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Modification</p>
                                    <h3 className="font-black text-dark text-base leading-tight">{eq.name}</h3>
                                </div>
                                <button type="button" onClick={resetEqForm} className="p-2 text-gray-400 hover:text-dark rounded-xl hover:bg-gray-100 transition-all"><X size={18}/></button>
                            </div>
                            <form onSubmit={handleSaveEquipment} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input required placeholder="Nom" value={eqName} onChange={e=>setEqName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                                    <select value={eqCategoryCode} onChange={e => {
                                        const t = equipmentTypes.find(t => t.code === e.target.value);
                                        setEqCategoryCode(e.target.value); setEqCategory(t?.name || '');
                                    }} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none">
                                        <option value="">Catégorie</option>
                                        {equipmentTypes.map(t => <option key={t.id} value={t.code}>{t.name} ({t.code})</option>)}
                                    </select>
                                </div>
                                <input placeholder="Local de stockage" value={eqStorageLocation} onChange={e=>setEqStorageLocation(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                                <div className="grid grid-cols-2 gap-4">
                                    <input placeholder="Marque" value={eqBrand} onChange={e=>setEqBrand(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:outline-none"/>
                                    <input placeholder="Modèle" value={eqModel} onChange={e=>setEqModel(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:outline-none"/>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input placeholder="Numéro de série" value={eqSerialNumber} onChange={e=>setEqSerialNumber(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:outline-none"/>
                                    <input placeholder="N° de référence" value={eqUniqueId} onChange={e=>setEqUniqueId(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:outline-none"/>
                                </div>
                                {eq.isBatch && (
                                    <input type="number" min="0" placeholder="Quantité en stock" value={eqBatchQty} onChange={e=>setEqBatchQty(parseInt(e.target.value)||0)} className="w-full p-4 bg-primary/10 border-primary border rounded-2xl text-xs font-bold text-primary"/>
                                )}
                                <textarea placeholder="Consignes d'utilisation..." value={eqInstructions} onChange={e=>setEqInstructions(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold resize-none h-20 focus:outline-none"/>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 border rounded-2xl bg-gray-50">
                                        <label className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-2 block">Maintenance (Usages)</label>
                                        <input type="number" min="1" placeholder="Ex: 50" value={eqUsageLimit} onChange={e=>setEqUsageLimit(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 bg-transparent text-xs font-bold focus:outline-none"/>
                                    </div>
                                    <div className="p-4 border rounded-2xl bg-gray-50">
                                        <label className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-2 block">Maintenance (Jours)</label>
                                        <input type="number" min="1" placeholder="Ex: 180" value={eqMaintDays} onChange={e=>setEqMaintDays(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 bg-transparent text-xs font-bold focus:outline-none"/>
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={resetEqForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
                                    <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                                </div>
                            </form>
                        </div>
                        ) : (
                        <div key={eq.id} className={`p-6 bg-white border rounded-[24px] shadow-sm flex flex-col justify-between ${eq.isArchived ? 'opacity-50 grayscale' : ''}`}>
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-black text-dark text-lg truncate pr-2">{eq.name}</h4>
                                    <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shrink-0 ${eq.status === 'AVAILABLE' ? 'bg-success/10 text-success' : eq.status === 'IN_USE' ? 'bg-orange-100 text-orange-600' : 'bg-danger/10 text-danger'}`}>
                                        {eq.status === 'AVAILABLE' ? 'DISPO' : eq.status === 'IN_USE' ? 'EMPRUNTÉ' : 'MAINT.'}
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
                                    {!eq.isArchived && <button onClick={() => editEquipment(eq)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Pencil size={16}/></button>}
                                    {!eq.isArchived && <button onClick={() => checkArchiveEq(eq.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                                </div>
                            </div>
                        </div>
                        )
                    ))}
                </div>
                {!editingEq && eqTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 px-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{filteredEqs.length} équipements</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setEqPage(p => Math.max(1, p - 1))} disabled={eqPage === 1} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronLeft size={15}/></button>
                            <span className="text-[10px] font-black tabular-nums text-dark">{eqPage} / {eqTotalPages}</span>
                            <button onClick={() => setEqPage(p => Math.min(eqTotalPages, p + 1))} disabled={eqPage === eqTotalPages} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronRight size={15}/></button>
                        </div>
                    </div>
                )}
                </>); })()}
            </div>
        </div>
      )}
      {activeTab === 'checklists' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
              {editingChk ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-4">
                  <Pencil size={28} className="text-primary opacity-40"/>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modification en cours</p>
                  <p className="text-xs font-medium text-gray-300 max-w-[160px]">Le formulaire est déployé directement sur la carte.</p>
                  <button onClick={resetChkForm} className="mt-2 px-6 py-3 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500 hover:bg-gray-200 transition-all">Annuler</button>
                </div>
              ) : (
              <>
                <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> Nouvelle Checklist</h3>
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
                        <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                    </div>
                </form>
              </>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {checklists.map(c => (
                        editingChk?.id === c.id ? (
                        <div key={c.id} className="md:col-span-2 bg-white border-2 border-primary/20 rounded-[24px] shadow-sm p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Modification</p>
                                    <h3 className="font-black text-dark text-base">{c.name}</h3>
                                </div>
                                <button type="button" onClick={resetChkForm} className="p-2 text-gray-400 hover:text-dark rounded-xl hover:bg-gray-100 transition-all"><X size={18}/></button>
                            </div>
                            <form onSubmit={handleSaveChecklist} className="space-y-4">
                                <input required placeholder="Nom" value={chkName} onChange={e=>setChkName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                                <div className="grid grid-cols-2 gap-4">
                                    <select value={chkTrigger} onChange={e=>setChkTrigger(e.target.value as any)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary">
                                        <option value="USE">À la Prise (Agent)</option>
                                        <option value="MAINTENANCE">À la Résolution (Technicien)</option>
                                    </select>
                                    <select value={chkContext} onChange={e=>setChkContext(e.target.value as any)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary">
                                        <option value="ALL">Tout le parc</option>
                                        <option value="TYPE">Par Type</option>
                                        <option value="SPECIFIC">Équipement spécifique</option>
                                    </select>
                                </div>
                                {chkContext !== 'ALL' && (
                                    <input required placeholder={chkContext === 'TYPE' ? "Type ? (ex: Perceuse)" : "ID équipement"} value={chkValue} onChange={e=>setChkValue(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold focus:border-primary focus:outline-none"/>
                                )}
                                <div className="pt-2 border-t">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Étapes ({chkItems.length})</h4>
                                    </div>
                                    {chkItems.map((item, i) => (
                                        <div key={i} className="mb-3 bg-gray-50 p-2 rounded-xl relative border group focus-within:border-primary">
                                            <button type="button" onClick={() => setChkItems(chkItems.filter((_,idx)=>idx!==i))} className="absolute -right-2 -top-2 bg-white text-danger border rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm"><X size={12}/></button>
                                            <input required value={item.label} onChange={e=>{const next=[...chkItems];next[i].label=e.target.value;setChkItems(next);}} placeholder="Question…" className="w-full px-2 py-2 bg-transparent text-xs font-bold focus:outline-none mb-2"/>
                                            <div className="flex items-center justify-between gap-2 px-2">
                                                <select value={item.type} onChange={e=>{const next=[...chkItems];next[i].type=e.target.value;setChkItems(next);}} className="bg-white border rounded border-gray-200 text-[10px] font-bold py-1 px-2">
                                                    <option value="BOOLEAN">OUI/NON</option>
                                                    <option value="TEXT">Texte</option>
                                                    <option value="NUMBER">Nombre</option>
                                                </select>
                                                {item.type === 'BOOLEAN' && chkTrigger === 'USE' && (
                                                    <div className="flex items-center gap-1 cursor-pointer" onClick={()=>{const next=[...chkItems];next[i].triggersIncidentIfFalse=!next[i].triggersIncidentIfFalse;setChkItems(next);}}>
                                                        <input type="checkbox" checked={item.triggersIncidentIfFalse} onChange={()=>{}} className="accent-danger"/>
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">BLOQUANT</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <button type="button" onClick={()=>setChkItems([...chkItems,{id:'s'+Date.now(),label:'',type:'BOOLEAN',required:true,triggersIncidentIfFalse:false}])} className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-primary/50 rounded-xl text-[10px] font-black tracking-widest uppercase text-gray-400 mt-2 transition-all">+ Ajouter une étape</button>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={resetChkForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
                                    <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                                </div>
                            </form>
                        </div>
                        ) : (
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
                                    {!c.isArchived && <button onClick={() => editChecklist(c)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Pencil size={16}/></button>}
                                    {!c.isArchived && <button onClick={() => checkArchiveChk(c.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                                </div>
                            </div>
                        </div>
                        )
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
               {editingSite ? (
                 <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-4">
                   <Pencil size={28} className="text-primary opacity-40"/>
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modification en cours</p>
                   <p className="text-xs font-medium text-gray-300 max-w-[160px]">Le formulaire est déployé directement sur la carte.</p>
                   <button onClick={resetSiteForm} className="mt-2 px-6 py-3 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500 hover:bg-gray-200 transition-all">Annuler</button>
                 </div>
               ) : (
               <>
                  <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><MapPin size={18} className="text-primary"/> Nouveau Chantier</h3>
                  <form onSubmit={handleSaveSite} className="space-y-4">
                      <input required placeholder="Nom du Chantier" value={siteName} onChange={e=>setSiteName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                      <textarea placeholder="Adresse / Description" value={siteAddress} onChange={e=>setSiteAddress(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary resize-none h-24"/>
                      <button type="submit" disabled={loading} className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                  </form>
               </>
               )}
             </div>
             <div className="lg:col-span-2">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {sites.map(s => (
                         editingSite?.id === s.id ? (
                         <div key={s.id} className="md:col-span-2 bg-white border-2 border-primary/20 rounded-[24px] p-6 shadow-sm">
                             <div className="flex items-center justify-between mb-5">
                                 <div>
                                     <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Modification</p>
                                     <h3 className="font-black text-dark text-base flex items-center gap-2"><MapPin size={16} className="text-primary"/> {s.name}</h3>
                                 </div>
                                 <button type="button" onClick={resetSiteForm} className="p-2 text-gray-400 hover:text-dark rounded-xl hover:bg-gray-100 transition-all"><X size={18}/></button>
                             </div>
                             <form onSubmit={handleSaveSite} className="space-y-4">
                                 <input required placeholder="Nom du Chantier" value={siteName} onChange={e=>setSiteName(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                                 <textarea placeholder="Adresse / Description" value={siteAddress} onChange={e=>setSiteAddress(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary resize-none h-24"/>
                                 <div className="flex gap-3">
                                     <button type="button" onClick={resetSiteForm} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
                                     <button type="submit" disabled={loading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                                 </div>
                             </form>
                         </div>
                         ) : (
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
                                        <span className="text-dark bg-white shadow-sm border px-2 py-0.5 rounded-md">{equipments.filter(e => e.currentSiteId === s.id && e.status === 'IN_USE').length}</span>
                                     </div>
                                 </div>
                             </div>
                             <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                                {s.status !== 'ARCHIVED' && <button onClick={() => editSite(s)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all"><Pencil size={16}/></button>}
                                {s.status !== 'ARCHIVED' && <button onClick={() => archiveSite(s.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all"><X size={16}/></button>}
                             </div>
                         </div>
                         )
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
                 {resetPwdResult && (
                     <div className="bg-primary text-white p-6 rounded-[24px] mb-6 shadow-2xl animate-in zoom-in-95">
                         <h4 className="font-black uppercase tracking-widest text-xs mb-2 flex items-center gap-2"><KeyRound size={16}/> Mot de passe provisoire</h4>
                         <p className="font-medium text-sm mb-4">Communiquez ce mot de passe à l'utilisateur. Il devra le changer à la prochaine connexion.</p>
                         <div className="bg-black/20 p-4 rounded-xl font-mono text-center text-lg tracking-widest">{resetPwdResult.tempPassword}</div>
                         <button onClick={() => setResetPwdResult(null)} className="w-full mt-4 bg-white text-primary py-3 rounded-xl font-black text-[10px] uppercase">Fermer</button>
                     </div>
                 )}
                 {(() => {
                     const filteredUsers = users.filter(u => showArchived ? true : !u.isArchived);
                     const usersTotalPages = Math.ceil(filteredUsers.length / USERS_PAGE_SIZE);
                     const displayUsers = filteredUsers.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);
                     return (<>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {displayUsers.map(u => (
                         <div key={u.id} className={`bg-white border rounded-[24px] p-6 shadow-sm ${u.isArchived ? 'opacity-50 grayscale' : ''} ${u.isDisabled ? 'border-orange-200' : ''}`}>
                             <div className="flex justify-between items-start mb-4">
                                 <div>
                                     <div className="font-black text-dark text-lg capitalize">{u.firstName} {u.lastName}</div>
                                     <div className="text-gray-400 font-medium text-xs mb-2">{u.email}</div>
                                     <div className="flex gap-2 flex-wrap">
                                         <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                             {u.tenantsAccess?.[user.tenantId] || u.role}
                                         </span>
                                         {u.isDisabled && (
                                             <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Désactivé</span>
                                         )}
                                     </div>
                                 </div>
                             </div>
                             {!u.isArchived && (
                                 <div className="flex justify-end gap-2 pt-4 border-t border-border">
                                     <button
                                         onClick={() => handleResetUserPwd(u.id)}
                                         disabled={userActionLoading === u.id}
                                         title="Réinitialiser le mot de passe"
                                         className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-all disabled:opacity-40"
                                     >
                                         {userActionLoading === u.id ? <RefreshCw size={16} className="animate-spin"/> : <KeyRound size={16}/>}
                                     </button>
                                     <button
                                         onClick={() => handleToggleDisable(u)}
                                         disabled={userActionLoading === u.id}
                                         title={u.isDisabled ? 'Réactiver' : 'Désactiver'}
                                         className={`p-2 rounded-xl transition-all disabled:opacity-40 ${u.isDisabled ? 'text-success hover:bg-success/10' : 'text-danger hover:bg-red-50'}`}
                                     >
                                         <Power size={16}/>
                                     </button>
                                 </div>
                             )}
                         </div>
                     ))}
                 </div>
                 {usersTotalPages > 1 && (
                     <div className="flex items-center justify-between mt-4 px-1">
                         <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{filteredUsers.length} utilisateurs</span>
                         <div className="flex items-center gap-2">
                             <button onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPage === 1} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronLeft size={15}/></button>
                             <span className="text-[10px] font-black tabular-nums text-dark">{usersPage} / {usersTotalPages}</span>
                             <button onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))} disabled={usersPage === usersTotalPages} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronRight size={15}/></button>
                         </div>
                     </div>
                 )}
                 </>); })()}
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

      {activeTab === 'centrales' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulaire ajout / placeholder modification */}
          <div className="lg:col-span-1 border rounded-[32px] bg-white p-8">
            {editingCdilUnit ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-4">
                <Pencil size={28} className="text-primary opacity-40"/>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Modification en cours</p>
                <p className="text-xs font-medium text-gray-300 max-w-[160px]">Le formulaire est déployé directement sur la carte.</p>
                <button onClick={cancelEditCdilUnit} className="mt-2 px-6 py-3 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500 hover:bg-gray-200 transition-all">Annuler</button>
              </div>
            ) : (
              <>
                <h3 className="font-black text-sm uppercase tracking-widest mb-6 text-dark flex gap-2"><Plus size={18} className="text-primary"/> Ajouter une Unité CDil</h3>
                <form onSubmit={handleCreateCdilUnit} className="space-y-4">
                  <input required placeholder="N° de série (ex: 4839)" value={cdilSerial} onChange={e=>setCdilSerial(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                  <input required placeholder="Localisation complète (ex: Oncologie B26)" value={cdilLocation} onChange={e=>setCdilLocation(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                  <div className="grid grid-cols-2 gap-3">
                    <input required placeholder="Service (ex: Oncologie)" value={cdilService} onChange={e=>setCdilService(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                    <input placeholder="Code salle (ex: B26)" value={cdilRoomCode} onChange={e=>setCdilRoomCode(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                  </div>
                  <textarea placeholder="Notes..." value={cdilNotes} onChange={e=>setCdilNotes(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary resize-none h-20"/>
                  <button type="submit" disabled={cdilLoading} className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">
                    {cdilLoading ? 'Enregistrement...' : 'Ajouter l\'unité'}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Liste unités + historique sessions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Unités actives */}
            <div>
              <h3 className="font-black text-sm uppercase tracking-widest text-dark mb-4 flex items-center gap-2">
                <Droplets size={16} className="text-primary"/> Unités CDil ({cdilUnits.length})
              </h3>
              {cdilLoading ? (
                <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-primary"/></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cdilUnits.map(unit => (
                    editingCdilUnit?.id === unit.id ? (
                    <div key={unit.id} className="md:col-span-2 bg-white border-2 border-primary/20 rounded-[24px] shadow-sm p-6">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Modification</p>
                          <h3 className="font-black text-dark text-base leading-tight">{unit.location}</h3>
                        </div>
                        <button type="button" onClick={cancelEditCdilUnit} className="p-2 text-gray-400 hover:text-dark rounded-xl hover:bg-gray-100 transition-all"><X size={18}/></button>
                      </div>
                      <form onSubmit={handleUpdateCdilUnit} className="space-y-4">
                        <input required placeholder="N° de série" value={cdilSerial} onChange={e=>setCdilSerial(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                        <input required placeholder="Localisation complète" value={cdilLocation} onChange={e=>setCdilLocation(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                        <div className="grid grid-cols-2 gap-3">
                          <input required placeholder="Service" value={cdilService} onChange={e=>setCdilService(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                          <input placeholder="Code salle" value={cdilRoomCode} onChange={e=>setCdilRoomCode(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary"/>
                        </div>
                        <textarea placeholder="Notes..." value={cdilNotes} onChange={e=>setCdilNotes(e.target.value)} className="w-full p-4 bg-gray-50 border rounded-2xl text-xs font-bold outline-none focus:border-primary resize-none h-20"/>
                        <div className="flex gap-3 pt-2">
                          <button type="button" onClick={cancelEditCdilUnit} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
                          <button type="submit" disabled={cdilLoading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">Enregistrer</button>
                        </div>
                      </form>
                    </div>
                    ) : (
                    <div key={unit.id} className="bg-white border rounded-[24px] p-5 shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-black text-dark text-base leading-none">{unit.location}</div>
                          {unit.currentState && (
                            <div className="flex gap-1">
                              {(['buse','crepine','ligne'] as const).map(k => (
                                <span key={k} className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${unit.currentState![k] === 'ok' ? 'bg-success/10 text-success border-success/20' : unit.currentState![k] === 1 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                  {k === 'buse' ? 'B' : k === 'crepine' ? 'C' : 'L'}:{String(unit.currentState![k])}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ID: {unit.serialNumber}</div>
                        <div className="text-[10px] font-bold text-gray-400">{unit.service}</div>
                        {unit.lastVisitDate && (
                          <div className="text-[10px] font-bold text-gray-300 mt-1">Dernière visite: {new Date(unit.lastVisitDate).toLocaleDateString('fr-FR')}</div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-border">
                        <button onClick={() => editCdilUnit(unit)} className="text-gray-400 hover:text-primary hover:bg-primary/5 p-2 rounded-xl transition-all" title="Modifier">
                          <Pencil size={15}/>
                        </button>
                        <button onClick={() => handleDeactivateCdilUnit(unit.id)} className="text-danger hover:bg-red-50 p-2 rounded-xl transition-all" title="Désactiver">
                          <X size={16}/>
                        </button>
                      </div>
                    </div>
                    )
                  ))}
                  {cdilUnits.length === 0 && (
                    <div className="col-span-full py-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] text-center">
                      <Droplets size={40} className="mx-auto text-gray-300 mb-3 opacity-50"/>
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aucune unité CDil configurée</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Historique des visites */}
            <div>
              <h3 className="font-black text-sm uppercase tracking-widest text-dark mb-4 flex items-center gap-2">
                <ClipboardList size={16} className="text-primary"/> Historique des Visites
              </h3>
              <div className="space-y-3">
                {cdilSessions.filter(s => s.status === 'COMPLETED').map(session => (
                  <div key={session.id} className="bg-white border rounded-[24px] p-5 shadow-sm flex items-center justify-between gap-4">
                    <div className="min-w-0flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-black text-dark text-sm truncate">{session.title}</div>
                        <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${session.sessionType === 'INTERVENTION' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                          {session.sessionType === 'INTERVENTION' ? 'Intervention' : 'Périodique'}
                        </span>
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {new Date(session.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
                        {' · '}{session.technicianName}
                        {' · '}{session.entries.length} unité{session.entries.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <button onClick={() => exportCdilSessionCsv(session)} className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-primary hover:text-white text-dark rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                      <Download size={13}/> CSV
                    </button>
                  </div>
                ))}
                {cdilSessions.filter(s => s.status === 'DRAFT').length > 0 && (
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center py-2">
                    {cdilSessions.filter(s => s.status === 'DRAFT').length} visite(s) en cours — accessible depuis l'onglet VISITES
                  </div>
                )}
                {cdilSessions.length === 0 && !cdilLoading && (
                  <div className="py-10 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] text-center">
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Aucune visite clôturée</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </div>
  );
};
