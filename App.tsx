
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AgentView } from './components/AgentView';
import { ManagementPanel } from './components/ManagementPanel';
import { TicketPanel } from './components/TicketPanel';
import { AdminPanel } from './components/AdminPanel'; 
import { Login } from './components/Login'; 
import { ForcePasswordChange } from './components/ForcePasswordChange'; 
import { User, UserRole } from './types';
import { db } from './services/db';
import { auth } from './services/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Loader2, QrCode } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(true);
  const [currentView, setCurrentView] = useState<string>('dashboard');

  // Fonction utilitaire pour conserver le contexte (TenantId) lors des mises à jour temps réel
  const updateUserState = useCallback((newUserProfile: User) => {
    setUser(currentUser => {
       // 1. Priorité : Le tenant sur lequel l'utilisateur est DÉJÀ en train de naviguer
       let targetTenantId = currentUser?.tenantId;

       // 2. Si pas de session active (Login initial), on regarde le LocalStorage
       if (!targetTenantId) {
           const savedTenantId = localStorage.getItem('miki_last_tenant_id');
           // CORRECTIF : On vérifie STRICTEMENT que l'utilisateur a le droit d'accéder à ce tenant sauvegardé
           // Cela évite qu'un Manager hérite du 'platform' d'un Admin précédent
           if (savedTenantId && (newUserProfile.tenantsAccess[savedTenantId] || newUserProfile.tenantsAccess['platform'] === UserRole.ADMIN)) {
               targetTenantId = savedTenantId;
           }
       }

       // 3. Fallback : Si le tenant cible est invalide ou vide, on prend le premier tenant disponible
       // On cherche dans les clés de tenantsAccess
       if (!targetTenantId || (!newUserProfile.tenantsAccess[targetTenantId] && newUserProfile.tenantsAccess['platform'] !== UserRole.ADMIN)) {
           const availableTenants = Object.keys(newUserProfile.tenantsAccess);
           if (availableTenants.length > 0) {
               // On évite 'platform' sauf si c'est le seul ou si on est Admin
               const standardTenants = availableTenants.filter(id => id !== 'platform');
               targetTenantId = standardTenants.length > 0 ? standardTenants[0] : availableTenants[0];
           } else {
               // Cas extrême : Utilisateur sans tenant (ne devrait pas arriver)
               targetTenantId = 'platform'; 
           }
       }

       // Déduction du rôle associé au tenant choisi
       let targetRole = newUserProfile.tenantsAccess[targetTenantId];
       if (!targetRole) {
           const isGlobalAdmin = newUserProfile.role === UserRole.ADMIN || newUserProfile.tenantsAccess['platform'] === UserRole.ADMIN;
           targetRole = (isGlobalAdmin && targetTenantId !== 'platform') ? UserRole.MANAGER : newUserProfile.role;
       }

       return {
         ...newUserProfile,
         tenantId: targetTenantId,
         role: targetRole
       };
    });
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Souscription Temps Réel au profil utilisateur
        unsubscribeProfile = db.subscribeToUserProfile(firebaseUser.uid, (profile) => {
            updateUserState(profile);
        });
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
        setUser(null);
      }
      setInitializing(false);
    });

    return () => {
      authUnsubscribe();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [updateUserState]);

  // Hook pour la vue initiale
  useEffect(() => {
     if (user) {
        const savedView = localStorage.getItem(`miki_view_${user.id}`);
        
        if (user.role === UserRole.ADMIN) {
            setCurrentView('admin');
        } else if (savedView === 'management' && user.role === UserRole.MANAGER) {
             setCurrentView('management');
        } else if (savedView === 'agent') {
             setCurrentView('agent');
        } else if (savedView === 'dashboard' && (user.role === UserRole.MANAGER || user.role === UserRole.CLIENT)) {
             setCurrentView('dashboard');
        } else if (savedView === 'tickets' && user.role === UserRole.TECHNICIAN) {
             setCurrentView('tickets');
        } else {
             // Fallback par défaut
             if (user.role === UserRole.TECHNICIAN) setCurrentView('tickets');
             else if (user.role === UserRole.AGENT) setCurrentView('agent');
             else setCurrentView('dashboard');
        }
     }
  }, [user?.id]); 

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleNavigate = (view: string) => {
      setCurrentView(view);
      if (user) {
          localStorage.setItem(`miki_view_${user.id}`, view);
      }
  };

  const handleSwitchTenant = async (newTenantId: string) => {
    if (!user) return;
    try {
        const updatedUser = await db.switchTenant(user, newTenantId);
        
        // PERSISTANCE : On sauvegarde le choix dans le LocalStorage
        localStorage.setItem('miki_last_tenant_id', newTenantId);

        // On met à jour l'état local immédiatement
        setUser(updatedUser); 
        
        if (updatedUser.role === UserRole.ADMIN) handleNavigate('admin');
        else if (updatedUser.role === UserRole.AGENT) handleNavigate('agent');
        else handleNavigate('dashboard');
    } catch (e) {
        alert("Impossible de changer d'organisation.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('miki_agent_mode');
    // Note: On ne supprime PAS 'miki_last_tenant_id' pour le garder pour la prochaine connexion
  };

  const refreshUserProfile = async () => {
     // No-op: Realtime listener handles updates.
  };

  if (initializing) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-background">
        <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 bg-primary/10 rounded-[32px] flex items-center justify-center text-primary animate-pulse">
                <QrCode size={48} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={64} className="text-primary animate-spin opacity-30" />
            </div>
        </div>
        <div className="mt-8 text-center space-y-2">
            <h1 className="font-black text-dark text-xl tracking-widest uppercase">MIKI</h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Synchronisation sécurisée...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={() => {}} />; 
  }

  if (user.mustChangePassword) {
    return (
      <ForcePasswordChange 
        user={user} 
        onSuccess={(updatedUser) => setUser(updatedUser)} 
        onLogout={handleLogout} 
      />
    );
  }

  return (
    <Layout 
      user={user} 
      isOnline={isOnline} 
      onLogout={handleLogout}
      currentView={currentView as any}
      onNavigate={handleNavigate}
      onSwitchTenant={handleSwitchTenant}
      hideBottomNav={false}
    >
      {currentView === 'admin' && user.role === UserRole.ADMIN && (
        <AdminPanel user={user} />
      )}

      {currentView === 'dashboard' && (user.role === UserRole.MANAGER || user.role === UserRole.CLIENT) && (
        <Dashboard user={user} />
      )}

      {currentView === 'management' && user.role === UserRole.MANAGER && (
        <ManagementPanel user={user} />
      )}

      {currentView === 'agent' && (
        <AgentView 
          user={user} 
          isOnline={isOnline} 
          onRefreshUser={refreshUserProfile}
        />
      )}

      {currentView === 'tickets' && user.role === UserRole.TECHNICIAN && (
        <TicketPanel user={user} />
      )}
      
      {currentView === 'dashboard' && user.role === UserRole.AGENT && (
         <div className="p-10 text-center text-gray-400 font-medium">Tableau de bord non accessible aux agents.</div>
      )}
    </Layout>
  );
}

export default App;
