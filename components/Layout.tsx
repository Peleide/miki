import React, { ReactNode, useState, useEffect } from 'react';
import { User, UserRole, Tenant, AppNotification } from '../types';
import { LogOut, LayoutDashboard, QrCode, Settings, Shield, ChevronDown, Wrench, Bell } from 'lucide-react';
import { db } from '../services/db';
import { Logo } from './Logo';

interface LayoutProps {
  children: ReactNode;
  user: User;
  isOnline: boolean;
  onLogout: () => void;
  currentView: 'dashboard' | 'agent' | 'management' | 'admin' | 'tickets';
  onNavigate: (view: 'dashboard' | 'agent' | 'management' | 'admin' | 'tickets') => void;
  onSwitchTenant?: (tenantId: string) => void;
  hideBottomNav?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, user, isOnline, onLogout, currentView, onNavigate, onSwitchTenant, hideBottomNav
}) => {
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        let tenants = await db.getTenantsForUser(user);
        
        // LOGIQUE D'INJECTION AMÉLIORÉE : 
        // On vérifie soit la présence explicite dans tenantsAccess, soit dans accessibleTenantIds
        const isPlatformAdmin = user.tenantsAccess['platform'] === UserRole.ADMIN || user.accessibleTenantIds?.includes('platform');

        if (isPlatformAdmin) {
             const platformTenant: Tenant = { 
                id: 'platform', 
                name: 'Console Super Admin', 
                status: 'ACTIVE', 
                timezone: 'Europe/Paris', 
                quotas: { equipments: 0, users: 0 } 
             };
             // On s'assure qu'il n'est pas déjà là et on l'ajoute au début
             tenants = [platformTenant, ...tenants.filter(t => t.id !== 'platform')];
        }

        setAvailableTenants(tenants);

        if (user.tenantId === 'platform') {
            setCurrentTenant({ 
              id: 'platform', 
              name: 'Administration', 
              status: 'ACTIVE', 
              timezone: 'Europe/Paris', 
              quotas: { equipments: 0, users: 0 } 
            });
        } else {
            const current = tenants.find(t => t.id === user.tenantId);
            if (current) setCurrentTenant(current);
        }
      } catch (e) {
        console.error("Layout initialization error", e);
      }
    };
    fetchTenants();
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = db.subscribeToNotifications(user.id, (notifs) => {
        setNotifications(notifs);
    });
    return () => unsub();
  }, [user?.id]);

  const navItems = [];
  
  if (user.role === UserRole.ADMIN) {
    navItems.push({ id: 'admin', label: 'ADMIN', icon: Shield });
  }
  
  if (user.role === UserRole.MANAGER) {
    navItems.push({ id: 'management', label: 'GESTION', icon: Settings });
    navItems.push({ id: 'dashboard', label: 'SUIVI', icon: LayoutDashboard });
    navItems.push({ id: 'agent', label: 'SCAN', icon: QrCode });
  } else if (user.role === UserRole.CLIENT) {
    navItems.push({ id: 'dashboard', label: 'SUIVI', icon: LayoutDashboard });
  } else if (user.role === UserRole.TECHNICIAN) {
    navItems.push({ id: 'tickets', label: 'TICKETS', icon: Wrench });
    navItems.push({ id: 'agent', label: 'SCAN', icon: QrCode });
  } else if (user.role === UserRole.AGENT) {
    navItems.push({ id: 'agent', label: 'SCAN', icon: QrCode });
  }

  const showSwitcher = availableTenants.length > 1;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col h-[100dvh] bg-background font-sans overflow-hidden">
      <header className="bg-white border-b border-border px-4 sm:px-10 py-5 flex items-center justify-between z-[400] print:hidden relative shrink-0">
        <div className="flex items-center gap-8 h-10 sm:h-12">
          <Logo 
            className="h-8 sm:h-11" 
            showText={false} 
            tenantLogoUrl={currentTenant?.id === 'platform' ? undefined : currentTenant?.logoUrl}
          />
          
          <div className="relative border-l border-border pl-6 sm:pl-8 h-full flex items-center">
            {showSwitcher ? (
               <button 
                 onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
                 className="flex items-center gap-2 hover:bg-gray-50 p-2 rounded-2xl transition-all text-left group"
               >
                 <div className="max-w-[150px] sm:max-w-none">
                   <h1 className="font-black text-dark leading-none text-[13px] sm:text-[17px] flex items-center gap-1.5 truncate tracking-tight">
                     {currentTenant?.id === 'platform' ? (
                        <span className="flex items-center gap-2 text-primary"><Shield size={16}/> Administration</span>
                     ) : (
                        currentTenant?.name || 'MIKI'
                     )}
                     <ChevronDown size={16} className={`shrink-0 text-gray-400 group-hover:text-primary transition-transform ${isTenantDropdownOpen ? 'rotate-180' : ''}`} />
                   </h1>
                   <p className="text-[9px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 truncate">
                     {user.firstName} • {user.role}
                   </p>
                 </div>
               </button>
            ) : (
               <div>
                 <h1 className="font-black text-dark leading-none text-[13px] sm:text-[17px] tracking-tight">{currentTenant?.name || 'MIKI'}</h1>
                 <p className="text-[9px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1">{user.firstName} • {user.role}</p>
               </div>
            )}

            {isTenantDropdownOpen && showSwitcher && (
              <>
                <div className="fixed inset-0 z-[410]" onClick={() => setIsTenantDropdownOpen(false)}></div>
                <div className="absolute top-full left-0 mt-3 w-72 bg-white border border-border shadow-2xl rounded-[32px] overflow-hidden z-[420] animate-in fade-in slide-in-from-top-2">
                   <div className="bg-gray-50/50 px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-border">Changer de site</div>
                   <div className="max-h-80 overflow-y-auto no-scrollbar">
                      {availableTenants.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { onSwitchTenant?.(t.id); setIsTenantDropdownOpen(false); }}
                          className={`w-full text-left px-6 py-5 text-sm hover:bg-primary/5 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors ${t.id === user.tenantId ? 'bg-primary/5 text-primary font-black' : 'text-dark font-bold'}`}
                        >
                           {t.id === 'platform' ? (
                               <div className="flex items-center gap-2 text-primary font-black">
                                   <Shield size={16} fill="currentColor" className="opacity-20"/>
                                   <span>{t.name}</span>
                               </div>
                           ) : (
                               <span className="truncate">{t.name}</span>
                           )}
                           
                           {t.id === user.tenantId && <div className="w-2 h-2 rounded-full bg-primary shadow-sm shadow-primary/40"></div>}
                        </button>
                      ))}
                   </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
            <div className="relative">
                <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="p-3 text-gray-400 hover:text-primary transition-all relative">
                    <Bell size={22} />
                    {unreadCount > 0 && (
                        <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full animate-pulse ring-2 ring-white"></span>
                    )}
                </button>
                {isNotifOpen && (
                  <>
                    <div className="fixed inset-0 z-[410]" onClick={() => setIsNotifOpen(false)}></div>
                    <div className="absolute top-14 right-[-50px] sm:right-0 w-[300px] sm:w-[350px] bg-white border border-border shadow-2xl rounded-3xl overflow-hidden z-[420] animate-in fade-in slide-in-from-top-2">
                        <div className="bg-gray-50/50 px-5 sm:px-6 py-4 flex justify-between items-center border-b border-border">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Notifications</span>
                            {unreadCount > 0 && (
                                <button onClick={() => db.markAllNotificationsRead(user.id)} className="text-[10px] text-primary font-black uppercase hover:underline tracking-widest">Tout lire</button>
                            )}
                        </div>
                        <div className="max-h-80 sm:max-h-96 overflow-y-auto no-scrollbar bg-white">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm font-bold">Aucune notification</div>
                            ) : (
                                notifications.map(n => (
                                    <div key={n.id} onClick={() => !n.read && db.markNotificationRead(user.id, n.id)} className={`p-4 border-b border-border last:border-0 transition-colors ${!n.read ? 'bg-primary/5 cursor-pointer' : 'bg-white opacity-80'}`}>
                                        <div className="flex gap-3">
                                            <div className="mt-1 shrink-0">
                                                {n.type === 'MAINTENANCE_REQUIRED' ? <Wrench size={16} className={`${n.read ? 'text-gray-400' : 'text-orange-500'}`}/> :
                                                 n.type === 'TICKET_CREATED' ? <Shield size={16} className={`${n.read ? 'text-gray-400' : 'text-red-500'}`}/> :
                                                 <Bell size={16} className={`${n.read ? 'text-gray-400' : 'text-primary'}`}/>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-sm tracking-tight truncate ${n.read ? 'font-bold text-gray-600' : 'font-black text-dark'}`}>{n.title}</h4>
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2 block">{new Date(n.timestamp).toLocaleString('fr-FR')}</span>
                                            </div>
                                            {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"></div>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                  </>
                )}
            </div>
            <button onClick={onLogout} className="text-gray-400 hover:text-danger transition-all p-3 rounded-2xl hover:bg-red-50 flex items-center gap-2 group">
              <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Déconnexion</span>
              <LogOut size={22} />
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden relative no-scrollbar">
        {children}
      </main>

      {!hideBottomNav && navItems.length > 0 && (
        <nav className="bg-white border-t border-border flex justify-around items-center py-2 shrink-0 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.03)] z-40 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {navItems.map(item => (
            <button 
                key={item.id}
                onClick={() => onNavigate(item.id as any)}
                className={`flex flex-col items-center justify-center flex-1 py-2 text-[9px] font-black uppercase tracking-[0.15em] gap-1 transition-all relative ${currentView === item.id ? 'text-primary' : 'text-gray-400'}`}
            >
                <item.icon size={20} strokeWidth={currentView === item.id ? 2.5 : 2} className="mb-0.5" />
                <span className="leading-none">{item.label}</span>
                {currentView === item.id && <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-1 bg-primary rounded-full"></div>}
            </button>
            ))}
        </nav>
      )}
    </div>
  );
};