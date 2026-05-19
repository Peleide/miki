
import React, { useState, useEffect, useMemo } from 'react';
import { User, Tenant, UserRole, AuditLog } from '../types';
import { db, TimeUtils } from '../services/db';
import { Search, Edit2, RefreshCw, X, PlayCircle, PauseCircle, ShieldCheck, UserMinus, UserPlus, Building2, Users2, Activity, History, Shield, Lock, Home, User as UserIcon, Settings, Database, Server, Trash2, AlertTriangle, Image as ImageIcon, Wrench, ChevronDown, Filter } from 'lucide-react';

interface AdminPanelProps {
  user: User;
}

interface TenantWithUsage extends Tenant {
    usage?: { equipmentsCount: number, usersCount: number };
}

// Dictionnaire de traduction des actions techniques vers du Français lisible
const AUDIT_TRANSLATIONS: Record<string, string> = {
    'CREATE_TENANT': 'Création de Site',
    'UPDATE_TENANT': 'Mise à jour Configuration Site',
    'CREATE_ESTABLISHMENT': 'Création Établissement',
    'CREATE_DEPARTMENT': 'Création Zone/Service',
    'CREATE_ROOM': 'Création de Salle',
    'UPDATE_ROOM': 'Modification de Salle',
    'CREATE_USER': 'Création Utilisateur',
    'UPDATE_USER': 'Modification Utilisateur',
    'RESET_PASSWORD': 'Réinit. Mot de passe',
    'DELETE_CHECKIN': 'Suppression de Pointage',
    'ARCHIVE_REPORT': 'Archivage Signalement',
    'USER_LOGIN': 'Connexion Utilisateur',
    'SYSTEM_RESET': 'Réinitialisation Système'
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'users' | 'audit' | 'settings'>('tenants');
  const [tenants, setTenants] = useState<TenantWithUsage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [userLimit, setUserLimit] = useState(100);

  const [newTenantName, setNewTenantName] = useState('');
  const [quotaRooms, setQuotaRooms] = useState(50);
  const [quotaUsers, setQuotaUsers] = useState(50);

  const [managerFirstName, setManagerFirstName] = useState('');
  const [managerLastName, setManagerLastName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerRole, setManagerRole] = useState<UserRole>(UserRole.MANAGER);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  
  // Filtre Audit : 'platform' = tout voir, sinon ID du tenant spécifique
  const [auditFilterTenant, setAuditFilterTenant] = useState('platform');

  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userAccessMap, setUserAccessMap] = useState<Record<string, UserRole | 'NONE'>>({});

  const [showBrandingModal, setShowBrandingModal] = useState<Tenant | null>(null);
  const [tempLogoUrl, setTempLogoUrl] = useState('');

  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => 
      u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allUsers, searchTerm]);

  useEffect(() => {
    refreshData();
  }, [activeTab, showArchived, userLimit, auditFilterTenant]);

  const refreshData = async () => {
    setLoading(true);
    try {
        const tBase = await db.getAllTenants();
        const enriched = await Promise.all(tBase.map(async (t) => {
            const usage = await db.getTenantUsageMetrics(t.id);
            return { ...t, usage };
        }));
        setTenants(enriched);
        
        if (activeTab === 'users') {
            const u = await db.getAllUsers(userLimit);
            setAllUsers(u);
        }
        if (activeTab === 'audit') {
            // Si auditFilterTenant est 'platform', on récupère tout (ou on laisse le backend décider)
            // Si c'est un ID spécifique, on filtre.
            const logs = await db.getAuditLogs(auditFilterTenant === 'platform' ? undefined : auditFilterTenant);
            setAuditLogs(logs);
        }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await db.createTenant(newTenantName, { equipments: quotaRooms, users: quotaUsers });
      setNewTenantName('');
      await refreshData();
    } catch (err) { alert("Erreur."); }
    finally { setLoading(false); }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setLoading(true);
    try {
      const newUser = await db.createUser(selectedTenantId, managerFirstName, managerLastName, managerEmail, managerRole);
      setCreatedUser(newUser); 
      setManagerFirstName(''); setManagerLastName(''); setManagerEmail('');
      await refreshData();
    } catch (err: any) { alert(err.message || "Erreur."); }
    finally { setLoading(false); }
  };

  const openUserEdit = (u: User) => {
    setSelectedUser(u);
    const access: Record<string, UserRole | 'NONE'> = {};
    const currentAccess = u.tenantsAccess || {};
    tenants.forEach(t => { access[t.id] = currentAccess[t.id] || 'NONE'; });
    setUserAccessMap(access);
  };

  const saveUserChanges = async () => {
    if (!selectedUser) return;
    setLoading(true);
    const newTenantsAccess: Record<string, UserRole> = {};
    Object.keys(userAccessMap).forEach(tid => {
        if (userAccessMap[tid] !== 'NONE') newTenantsAccess[tid] = userAccessMap[tid] as UserRole;
    });
    try {
        await db.adminUpdateUser(selectedUser.id, { tenantsAccess: newTenantsAccess }, user);
        await refreshData();
        setSelectedUser(null);
    } catch (e) { alert("Erreur."); }
    finally { setLoading(false); }
  };

  const toggleUserArchive = async () => {
    if (!selectedUser) return;
    const nextStatus = !selectedUser.isArchived;
    setLoading(true);
    try {
        await db.adminUpdateUser(selectedUser.id, { 
            isArchived: nextStatus,
            isDisabled: nextStatus ? true : selectedUser.isDisabled 
        }, user);
        setSelectedUser({ ...selectedUser, isArchived: nextStatus });
        await refreshData();
    } catch (e) { alert("Erreur."); }
    finally { setLoading(false); }
  };

  const toggleUserDisable = async () => {
    if (!selectedUser) return;
    const nextStatus = !selectedUser.isDisabled;
    setLoading(true);
    try {
        await db.adminUpdateUser(selectedUser.id, { isDisabled: nextStatus }, user);
        setSelectedUser({ ...selectedUser, isDisabled: nextStatus });
        await refreshData();
    } catch (e) { alert("Erreur."); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (!confirm("Attention : Cela va générer un nouveau mot de passe temporaire pour cet utilisateur. Voulez-vous continuer ?")) return;
    setLoading(true);
    try {
        const result = await db.managerResetPassword(selectedUser.id, user);
        if (result.tempPassword) {
            // On réutilise la modale de création pour afficher le mot de passe
            setCreatedUser({
                ...selectedUser,
                password: result.tempPassword
            });
            // On ferme la modale d'édition pour voir le mot de passe
            setSelectedUser(null);
        } else {
            alert("Réinitialisation demandée. L'utilisateur devra changer son mot de passe à la prochaine connexion.");
        }
    } catch (e) { alert("Erreur."); }
    finally { setLoading(false); }
  };

  const saveBranding = async () => {
    if (!showBrandingModal) return;
    setLoading(true);
    try {
      await db.adminUpdateTenantBranding(showBrandingModal.id, tempLogoUrl, user);
      await refreshData();
      setShowBrandingModal(null);
    } catch (e) { alert("Erreur Branding."); }
    finally { setLoading(false); }
  };

  const handleRepairProfile = async () => {
      setLoading(true);
      try {
          await db.repairAdminProfile();
          alert("Profil réparé. Veuillez rafraîchir la page.");
          window.location.reload();
      } catch (e: any) { alert("Erreur réparation : " + e.message); }
      finally { setLoading(false); }
  };

  const handlePlatformReset = async () => {
    if (!confirm("ATTENTION : Cette action est irréversible. Tous les tenants, locaux, pointages et comptes (sauf le vôtre) seront supprimés. Confirmer ?")) return;
    setLoading(true);
    try {
        await db.dangerousResetPlatform(user.id);
        alert("Plateforme réinitialisée avec succès.");
        window.location.reload();
    } catch (e) { alert("Erreur lors de la réinitialisation."); }
    finally { setLoading(false); }
  };

  const renderUsageBar = (current: number, max: number, label: string) => {
      const percent = Math.min((current / max) * 100, 100);
      let colorClass = 'bg-primary';
      if (percent >= 95) colorClass = 'bg-danger';
      else if (percent >= 80) colorClass = 'bg-warning';
      return (
          <div className="w-full space-y-1">
            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-gray-400">
                <span>{label}</span>
                <span>{current} / {max}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${colorClass}`} style={{ width: `${percent}%` }}></div>
            </div>
          </div>
      );
  };

  const getLogIcon = (cat: string) => {
    switch(cat) {
        case 'SECURITY': return <ShieldCheck size={18}/>;
        case 'STRUCTURE': return <Building2 size={18}/>;
        case 'BILLING': return <Activity size={18}/>;
        default: return <UserIcon size={18}/>;
    }
  };

  const getLogColor = (cat: string) => {
    switch(cat) {
        case 'SECURITY': return 'bg-red-50 text-danger border-red-100';
        case 'STRUCTURE': return 'bg-blue-50 text-primary border-blue-100';
        case 'BILLING': return 'bg-indigo-50 text-indigo-500 border-indigo-100';
        default: return 'bg-gray-50 text-gray-500 border-gray-100';
    }
  };

  const getHumanReadableAction = (action: string) => {
      return AUDIT_TRANSLATIONS[action] || action.replace(/_/g, ' ');
  };

  const getFormattedDate = (isoString: string) => {
      return TimeUtils.formatInTimezone(isoString, 'Europe/Paris', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10 relative pb-24 font-sans overflow-y-auto h-full no-scrollbar">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div>
          <h2 className="text-3xl font-black text-dark tracking-tighter leading-none mb-2">Platform Console</h2>
          <p className="text-gray-400 text-sm font-medium tracking-tight">Pilotage des infrastructures MIKI.</p>
        </div>
        <div className="flex bg-white p-1.5 rounded-[20px] shadow-sm border border-border floating-light">
            {[
              {id: 'tenants', label: 'Sites', icon: Building2},
              {id: 'users', label: 'Comptes', icon: Users2},
              {id: 'audit', label: 'Audit', icon: History},
              {id: 'settings', label: 'Système', icon: Shield}
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'text-gray-400 hover:text-dark'}`}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
        </div>
      </div>

      {activeTab === 'tenants' && (
        <div className="space-y-10 animate-in fade-in duration-500">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[32px] border border-border flex items-center gap-5">
                    <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center"><Building2 size={28}/></div>
                    <div><div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Sites Actifs</div><div className="text-3xl font-black text-dark">{tenants.length}</div></div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-border flex items-center gap-5">
                    <div className="w-14 h-14 bg-success/10 text-success rounded-2xl flex items-center justify-center"><Users2 size={28}/></div>
                    <div><div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Utilisateurs Totaux</div><div className="text-3xl font-black text-dark">{allUsers.length || '...'}</div></div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-border flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center"><Activity size={28}/></div>
                    <div><div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Statut plateforme</div><div className="text-3xl font-black text-success">OK</div></div>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-10 rounded-[40px] border border-border shadow-sm floating-light">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><PlayCircle size={20} /></div>
                    <h3 className="text-[11px] font-black uppercase text-dark tracking-widest">Nouveau Site Client</h3>
                  </div>
                  <form onSubmit={handleCreateTenant} className="space-y-6">
                      <input required value={newTenantName} onChange={e => setNewTenantName(e.target.value)} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark outline-none focus:border-primary transition-all" placeholder="Nom de l'organisation" />
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quota Salles</label>
                          <input type="number" value={quotaRooms} onChange={e => setQuotaRooms(Number(e.target.value))} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark outline-none" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quota Agents</label>
                          <input type="number" value={quotaUsers} onChange={e => setQuotaUsers(Number(e.target.value))} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark outline-none" />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-xl shadow-primary/20 uppercase tracking-widest text-[11px]">Enregistrer Site</button>
                  </form>
                </div>

                <div className="bg-white p-10 rounded-[40px] border border-border shadow-sm floating-light">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-2xl bg-success/10 text-success flex items-center justify-center"><Users2 size={20} /></div>
                    <h3 className="text-[11px] font-black uppercase text-dark tracking-widest">Accès Manager / Client</h3>
                  </div>
                  <form onSubmit={handleCreateManager} className="space-y-6">
                      <div className="flex gap-4">
                        <select required value={selectedTenantId} onChange={e => setSelectedTenantId(e.target.value)} className="flex-1 border-2 border-border rounded-2xl p-4 text-sm bg-white font-black text-dark outline-none">
                            <option value="">Affecter au site...</option>
                            {tenants.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
                        </select>
                        <select value={managerRole} onChange={e => setManagerRole(e.target.value as UserRole)} className="w-40 border-2 border-border rounded-2xl p-4 text-sm bg-white font-black text-dark outline-none">
                            <option value={UserRole.MANAGER}>MANAGER</option>
                            <option value={UserRole.CLIENT}>CLIENT</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <input required value={managerFirstName} onChange={e => setManagerFirstName(e.target.value)} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark" placeholder="Prénom" />
                        <input required value={managerLastName} onChange={e => setManagerLastName(e.target.value)} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark" placeholder="Nom" />
                      </div>
                      <input required type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark" placeholder="Email professionnel" />
                      <button type="submit" disabled={loading || !selectedTenantId} className="w-full bg-success text-white font-black py-5 rounded-2xl shadow-xl shadow-success/10 uppercase tracking-widest text-[11px]">Créer Profil</button>
                  </form>
                </div>
            </div>

            <div className="bg-white rounded-[40px] border border-border shadow-sm overflow-x-auto no-scrollbar floating-light">
                <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-border">
                    <tr><th className="px-10 py-5">Organisation</th><th className="px-10 py-5 w-72">Consommation Quotas</th><th className="px-10 py-5">Branding</th><th className="px-10 py-5 text-right">Contrôle</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-primary/[0.02] transition-colors">
                        <td className="px-10 py-8">
                            <div className="font-black text-dark text-lg leading-none mb-1">{t.name}</div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.id}</div>
                        </td>
                        <td className="px-10 py-8 space-y-4">
                            {t.usage && (
                                <>
                                    {renderUsageBar(t.usage.equipmentsCount, t.quotas.equipments, 'Locaux')}
                                    {renderUsageBar(t.usage.usersCount, t.quotas.users, 'Utilisateurs')}
                                </>
                            )}
                        </td>
                        <td className="px-10 py-8">
                            <button 
                              onClick={() => { setShowBrandingModal(t); setTempLogoUrl(t.logoUrl || ''); }}
                              className="flex items-center gap-2 text-[10px] font-black text-primary bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 hover:bg-primary hover:text-white transition-all"
                            >
                                <ImageIcon size={14} /> Logo
                            </button>
                        </td>
                        <td className="px-10 py-8 text-right flex items-center justify-end gap-2">
                            <button onClick={() => db.adminUpdateTenantStatus(t.id, t.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED', user).then(refreshData)} className={`p-3 rounded-2xl transition-all border shadow-sm active:scale-90 ${t.status === 'SUSPENDED' ? 'bg-green-50 border-green-100 text-success' : 'bg-red-50 border-red-100 text-danger'}`}>{t.status === 'SUSPENDED' ? <PlayCircle size={22} /> : <PauseCircle size={22} />}</button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        </div>
      )}

      {/* BRANDING MODAL */}
      {showBrandingModal && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-[150] flex items-center justify-center p-6">
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 space-y-8 animate-in zoom-in-95">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-black text-dark tracking-tight leading-none uppercase">Logo du Site</h3>
                    <button onClick={() => setShowBrandingModal(null)} className="text-gray-300 hover:text-dark"><X size={28}/></button>
                </div>
                <div className="space-y-6">
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden">
                            {tempLogoUrl ? <img src={tempLogoUrl} alt="Preview" className="w-full h-full object-contain" /> : <ImageIcon size={32} className="text-gray-300"/>}
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase text-center leading-relaxed">Format recommandé : PNG/WEBP transparent<br/>Largeur max 512px</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lien direct vers l'image</label>
                        <input 
                          type="url" 
                          value={tempLogoUrl} 
                          onChange={e => setTempLogoUrl(e.target.value)} 
                          className="w-full border-2 border-border rounded-2xl p-4 text-sm font-black text-dark outline-none focus:border-primary transition-all" 
                          placeholder="https://..." 
                        />
                    </div>
                    <button onClick={saveBranding} disabled={loading} className="w-full bg-primary text-white py-5 rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-xl shadow-primary/20">Enregistrer Branding</button>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 bg-white p-5 rounded-[32px] border border-border shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-xl text-primary"><History size={24} /></div>
                    <div>
                        <h3 className="text-base font-black text-dark leading-none mb-1">Journal d'Audit</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Historique des actions sensibles</p>
                    </div>
                </div>
                
                <div className="relative min-w-[300px]">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Filter size={16} /></div>
                    <select 
                        value={auditFilterTenant} 
                        onChange={e => setAuditFilterTenant(e.target.value)} 
                        className="w-full border-2 border-border rounded-xl py-3 pl-11 pr-4 text-sm font-black text-dark bg-gray-50 outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                        <option value="platform">🌍 Tout le journal global</option>
                        <optgroup label="Filtrer par site">
                             {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><ChevronDown size={16} /></div>
                </div>
             </div>

             <div className="bg-white rounded-[40px] border border-border shadow-sm overflow-hidden floating-light p-8">
                <div className="space-y-6 relative">
                    {/* Timeline Line */}
                    <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-gradient-to-b from-gray-100 via-gray-100 to-transparent"></div>
                    
                    {auditLogs.map((log, idx) => (
                        <div key={log.id} className="relative pl-16 py-2 group">
                            {/* Icon Indicator */}
                            <div className={`absolute left-[14px] top-3 w-9 h-9 rounded-2xl border-2 flex items-center justify-center z-10 transition-all duration-300 group-hover:scale-110 shadow-sm ${getLogColor(log.category)}`}>
                                {getLogIcon(log.category)}
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-100 rounded-[28px] p-5 hover:bg-white hover:shadow-md hover:border-primary/20 transition-all duration-300">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${log.category === 'SECURITY' ? 'bg-red-100 text-danger' : 'bg-gray-200 text-gray-500'}`}>
                                                {log.category}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                {getFormattedDate(log.timestamp)}
                                            </span>
                                        </div>
                                        <h4 className="font-black text-dark text-lg leading-tight mb-1">
                                            {getHumanReadableAction(log.action)}
                                        </h4>
                                        <p className="text-sm font-medium text-gray-500 leading-relaxed max-w-2xl">
                                            {log.details || "Aucun détail supplémentaire."}
                                        </p>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm md:text-right">
                                        <div className="flex flex-col items-end">
                                            <div className="text-[10px] font-black text-dark uppercase tracking-wide">{log.userName}</div>
                                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                                {log.tenantName === 'Administration' ? <Shield size={10} /> : <Building2 size={10} />}
                                                {log.tenantName}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {auditLogs.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
                            <div className="bg-gray-100 p-6 rounded-full mb-4"><History size={48} className="text-gray-300"/></div>
                            <p className="text-gray-300 font-black uppercase tracking-widest text-xs">Aucun événement enregistré pour cette période/site.</p>
                        </div>
                    )}
                </div>
             </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-8 animate-in fade-in duration-500">
           <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="relative flex-1 w-full">
                <input type="text" placeholder="Rechercher par nom ou email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-14 pr-6 py-5 border-2 border-border rounded-[28px] shadow-sm text-sm font-black focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all" />
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={24} />
              </div>
           </div>
           <div className="bg-white rounded-[40px] border border-border shadow-sm overflow-x-auto no-scrollbar floating-light">
             <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-border">
                   <tr><th className="px-10 py-6">Utilisateur</th><th className="px-10 py-6">Rôle Principal</th><th className="px-10 py-6 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                   {filteredUsers.map(u => (
                        <tr key={u.id} className={`hover:bg-primary/[0.02] transition-colors group ${u.isArchived ? 'opacity-50 grayscale' : ''}`}>
                           <td className="px-10 py-6">
                              <div className="font-black text-dark text-base tracking-tight mb-1">{u.firstName} {u.lastName}</div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase">{u.email}</div>
                           </td>
                           <td className="px-10 py-6"><span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${u.role === 'ADMIN' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>{u.role}</span></td>
                           <td className="px-10 py-6 text-right"><button onClick={() => openUserEdit(u)} className="text-primary bg-primary/5 p-3 rounded-2xl hover:bg-primary hover:text-white transition-all shadow-sm"><Edit2 size={18} /></button></td>
                        </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-10 animate-in fade-in duration-500 max-w-4xl mx-auto">
             <div className="bg-white p-6 sm:p-12 rounded-[48px] border border-border shadow-sm floating-light space-y-10">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-3xl flex items-center justify-center"><Server size={32}/></div>
                    <div><h3 className="text-2xl font-black text-dark tracking-tighter leading-none mb-1.5">Santé Plateforme</h3><p className="text-gray-400 font-bold text-sm">Gestion des ressources globales et maintenance.</p></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-6 sm:p-8 rounded-[32px] border border-border space-y-4">
                        <div className="flex items-center gap-3 text-dark"><Wrench size={20} className="text-primary"/><span className="text-xs font-black uppercase tracking-widest">Diagnostic Compte</span></div>
                        <p className="text-xs text-gray-500 leading-relaxed font-medium">Répare les incohérences de droits Admin si la console apparaît vide.</p>
                        <button onClick={handleRepairProfile} disabled={loading} className="w-full bg-white border border-border text-dark py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm">Réparer Droits Admin</button>
                    </div>
                    <div className="bg-gray-50 p-6 sm:p-8 rounded-[32px] border border-border space-y-4">
                        <div className="flex items-center gap-3 text-dark"><Settings size={20} className="text-primary"/><span className="text-xs font-black uppercase tracking-widest">Global Config</span></div>
                        <p className="text-xs text-gray-500 leading-relaxed font-medium">Mise à jour des paramètres système et gestion des ressources partagées.</p>
                        <button className="w-full bg-white border border-border text-dark py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm">Paramétrer</button>
                    </div>
                </div>

                {/* DANGER ZONE - FULL RESET */}
                <div className="bg-red-50 p-6 sm:p-10 rounded-[40px] border-2 border-red-100 space-y-6">
                    <div className="flex items-center gap-4 text-danger">
                        <div className="bg-white p-3 rounded-2xl shadow-sm"><AlertTriangle size={24} /></div>
                        <div>
                            <h4 className="font-black text-lg tracking-tight leading-none mb-1">Zone de Maintenance Critique</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Actions de réinitialisation complète</p>
                        </div>
                    </div>
                    <div className="bg-white/50 p-6 rounded-3xl space-y-4">
                        <p className="text-xs text-danger font-bold leading-relaxed">
                            Réinitialiser la plateforme : supprime TOUS les clients, locaux, pointages et comptes utilisateurs. Seul votre profil SuperAdmin sera conservé.
                        </p>
                        <button 
                          onClick={handlePlatformReset}
                          disabled={loading}
                          className="flex items-center justify-center gap-3 w-full bg-danger text-white py-5 rounded-[24px] text-[11px] font-black uppercase tracking-widest shadow-xl shadow-danger/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            <Trash2 size={20} /> {loading ? "Réinitialisation..." : "Nettoyer la base de données (Nuke)"}
                        </button>
                    </div>
                </div>

                <div className="pt-6 border-t border-border flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Version MIKI 2.6.0 (Stable)</span>
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-success animate-pulse"></div><span className="text-[10px] font-black text-success uppercase tracking-widest">Système OK</span></div>
                </div>
             </div>
        </div>
      )}

      {/* MODALES */}
      {selectedUser && (
        <div className="fixed inset-0 bg-dark/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
           <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
             <div className="p-8 border-b border-border flex justify-between items-center bg-gray-50/50"><div><h3 className="font-black text-dark uppercase tracking-widest text-[11px] leading-none mb-1">Gérer les accès</h3><p className="text-[10px] font-bold text-gray-400 uppercase">{selectedUser.email}</p></div><button onClick={() => setSelectedUser(null)} className="text-gray-300 hover:text-dark p-2 transition-colors"><X size={28}/></button></div>
             <div className="flex-1 overflow-y-auto p-12 space-y-8 no-scrollbar">
               <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Attribution des rôles par site</h4>
                 <div className="space-y-3">
                   {tenants.map(t => (
                     <div key={t.id} className="flex items-center justify-between bg-gray-50 p-5 rounded-[24px] border border-border group">
                        <div className="font-black text-dark text-sm">{t.name}</div>
                        <select value={userAccessMap[t.id] || 'NONE'} onChange={(e) => setUserAccessMap(prev => ({ ...prev, [t.id]: e.target.value as any }))} className="border-2 border-border rounded-xl px-4 py-2 text-[10px] font-black uppercase bg-white">
                            <option value="NONE">Aucun accès</option>
                            <option value={UserRole.AGENT}>AGENT</option>
                            <option value={UserRole.MANAGER}>MANAGER</option>
                            <option value={UserRole.CLIENT}>CLIENT</option>
                        </select>
                     </div>
                   ))}
                 </div>
               </div>

               <div className="pt-6 border-t border-border grid grid-cols-3 gap-3">
                    <button onClick={toggleUserDisable} className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border font-black text-[9px] uppercase tracking-widest transition-all ${selectedUser.isDisabled ? 'bg-success/5 text-success border-success/10' : 'bg-red-50 text-danger border-danger/10'}`}>
                        {selectedUser.isDisabled ? <><PlayCircle size={18}/> Activer</> : <><PauseCircle size={18}/> Désactiver</>}
                    </button>
                    <button onClick={handleResetPassword} className="flex flex-col items-center justify-center gap-2 p-4 bg-yellow-50 text-warning rounded-2xl border border-warning/10 font-black text-[9px] uppercase tracking-widest transition-all hover:bg-yellow-100">
                        <Lock size={18}/> Reset Pass
                    </button>
                    <button onClick={toggleUserArchive} className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border font-black text-[9px] uppercase tracking-widest transition-all ${selectedUser.isArchived ? 'bg-green-50 text-success border-success/10' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                        {selectedUser.isArchived ? <><UserPlus size={18}/> Restaurer</> : <><UserMinus size={18}/> Archiver</>}
                    </button>
               </div>
             </div>
             <div className="p-10 bg-white border-t border-border"><button onClick={saveUserChanges} className="w-full py-5 rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] bg-primary text-white shadow-xl transition-all">Valider les changements</button></div>
           </div>
        </div>
      )}

      {createdUser && (
        <div className="fixed inset-0 bg-dark/80 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-[48px] p-12 w-full max-w-lg text-center shadow-2xl relative">
             <div className="absolute top-8 right-8 text-gray-300 hover:text-dark cursor-pointer" onClick={() => setCreatedUser(null)}><X size={24} /></div>
             <div className="bg-success/10 text-success w-20 h-20 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner"><ShieldCheck size={40} /></div>
             <h3 className="font-black text-dark text-3xl mb-3 tracking-tighter">Profil {createdUser.password === 'Compte Existant (Pas de changement)' ? 'Mis à jour' : (createdUser.password?.length < 10 ? 'Réinitialisé' : 'Créé')}</h3>
             <div className="space-y-4 mb-10">
                <div className="bg-gray-50 p-6 rounded-[32px] border-2 border-gray-100"><div className="text-[10px] font-black text-gray-400 uppercase mb-2">Identifiant</div><div className="font-black text-dark text-lg">{createdUser.email}</div></div>
                {createdUser.password && (
                    <div className="bg-primary/5 p-8 rounded-[40px] border-2 border-primary/10">
                        <div className="text-[10px] font-black text-primary uppercase mb-2">Mot de passe temporaire</div>
                        <div className="font-black text-primary text-4xl tracking-[0.2em]">{createdUser.password}</div>
                    </div>
                )}
             </div>
             <button onClick={() => setCreatedUser(null)} className="w-full bg-dark text-white font-black py-5 rounded-2xl tracking-[0.2em] text-[11px] uppercase transition-all">Fermer</button>
           </div>
        </div>
      )}
    </div>
  );
};
