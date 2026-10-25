import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, CalendarDays, ClipboardList, Inbox, ListChecks, Boxes, QrCode, Settings, LogOut, Bell, Menu, X,
  Wrench, Shield, ClipboardCheck,
} from 'lucide-react';
import { GmaoRole, GmaoUser, ROLE_LABEL } from '../../functions/src/gmao/model';
import { GmaoBackend } from '../../services/gmao/backend';
import { GmaoProvider, useGmao } from './GmaoContext';
import { DashboardView } from './DashboardView';
import { AssetsView, AssetDetailModal } from './AssetsView';
import { RequestsView, RequestDetailModal } from './RequestsView';
import { WorkOrdersView, WorkOrderDetailModal } from './WorkOrdersView';
import { PreventiveView } from './PreventiveView';
import { PlanningView } from './PlanningView';
import { TerrainView } from './TerrainView';
import { SettingsView } from './SettingsView';
import { TrackingView } from './TrackingView';
import { Logo } from '../Logo';

type View = 'accueil' | 'planning' | 'interventions' | 'signalements' | 'preventif' | 'parc' | 'suivi' | 'scanner' | 'reglages';

const NAV: Record<View, { label: string; short: string; icon: any }> = {
  accueil: { label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  planning: { label: 'Planning', short: 'Planning', icon: CalendarDays },
  interventions: { label: 'Interventions', short: 'Interv.', icon: ClipboardList },
  signalements: { label: 'Signalements', short: 'Signal.', icon: Inbox },
  preventif: { label: 'Préventif', short: 'Préventif', icon: ListChecks },
  parc: { label: 'Parc', short: 'Parc', icon: Boxes },
  suivi: { label: 'Suivi des maintenances', short: 'Suivi', icon: ClipboardCheck },
  scanner: { label: 'Scanner', short: 'Scanner', icon: QrCode },
  reglages: { label: 'Réglages', short: 'Réglages', icon: Settings },
};

const VIEWS_BY_ROLE: Record<GmaoRole, View[]> = {
  RESPONSABLE: ['accueil', 'planning', 'interventions', 'signalements', 'parc', 'preventif', 'suivi', 'scanner', 'reglages'],
  TECHNICIEN: ['planning', 'interventions', 'scanner', 'signalements', 'parc', 'accueil', 'preventif', 'suivi'],
  CLIENT: ['accueil', 'parc', 'scanner', 'suivi', 'signalements'],
};
const CLIENT_LABEL: Partial<Record<View, string>> = { accueil: 'Accueil', parc: 'Vos machines' };

export interface ShellProps {
  backend: GmaoBackend;
  me: GmaoUser;
  onLogout: () => void;
  headerExtra?: React.ReactNode;
  /** Jeton QR à ouvrir au démarrage (lien /q/… ouvert par un compte connecté). */
  openToken?: string | null;
}

const NotificationsBell: React.FC = () => {
  const { notifications, backend, me } = useGmao();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;
  const sorted = [...notifications].sort((a, b) => Number(a.read) - Number(b.read) || b.timestamp.localeCompare(a.timestamp)).slice(0, 30);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-2.5 text-gray-400 hover:text-primary relative" aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-black flex items-center justify-center">{unread}</span>}
      </button>
      {open && <>
        <div className="fixed inset-0 z-[410]" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-12 w-[320px] max-w-[calc(100vw-24px)] bg-white border border-border shadow-2xl rounded-3xl overflow-hidden z-[420]">
          <div className="px-5 py-3 flex justify-between items-center border-b border-border">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Notifications</span>
            {unread > 0 && <button onClick={() => backend.markAllNotificationsRead(me.id)} className="text-[10px] font-black uppercase tracking-widest text-primary">Tout lire</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {sorted.length === 0 ? <div className="p-6 text-center text-sm text-gray-400">Aucune notification</div> : sorted.map(n => (
              <button key={n.id} onClick={() => !n.read && backend.markNotificationRead(me.id, n.id)} className={`w-full text-left px-5 py-3 border-b border-border last:border-0 ${n.read ? 'opacity-60' : 'bg-primary/5'}`}>
                <div className="flex gap-2 items-start">
                  {n.type === 'CRITICAL' ? <Shield size={14} className="text-danger mt-0.5 shrink-0" /> : n.type === 'WARNING' ? <Wrench size={14} className="text-orange-500 mt-0.5 shrink-0" /> : <Bell size={14} className="text-primary mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm font-black text-dark truncate">{n.title}</div>
                    <div className="text-xs text-gray-500 line-clamp-2">{n.message}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{new Date(n.timestamp).toLocaleString('fr-FR')}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </>}
    </div>
  );
};

const Body: React.FC<{ view: View; setView: (v: View) => void; views: View[] } & ShellProps> = ({ view, setView, views, me, onLogout, headerExtra, openToken }) => {
  const g = useGmao();
  const [moreOpen, setMoreOpen] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    if (!openToken || opened.current || g.loading) return;
    opened.current = true;
    const a = g.assets.find(x => x.qrToken === openToken);
    if (a) g.openAsset(a.id);
    else g.toast('Cette machine ne fait pas partie de votre parc.', 'info');
  }, [openToken, g.loading, g.assets]);

  const label = (v: View) => (me.role === 'CLIENT' && CLIENT_LABEL[v]) || NAV[v].label;
  const pending = g.requests.filter(r => r.status === 'A_TRAITER' && (!g.isTech || g.mine(g.assetById(r.assetId)))).length;
  const badge: Partial<Record<View, number>> = {
    signalements: g.isClient ? 0 : pending,
    interventions: g.isTech ? g.workOrders.filter(w => w.assigneeIds.includes(me.id) && ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS'].includes(w.status)).length : 0,
  };
  const mobileMain = views.slice(0, 4);
  const mobileMore = views.slice(4);

  const NavButton: React.FC<{ v: View; vertical?: boolean }> = ({ v, vertical }) => {
    const Icon = NAV[v].icon;
    const active = view === v;
    return vertical ? (
      <button onClick={() => { setView(v); setMoreOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold text-left transition-all ${active ? 'bg-primary text-white shadow-sm shadow-primary/30' : 'text-gray-500 hover:bg-gray-50 hover:text-dark'}`}>
        <Icon size={18} />{label(v)}
        {!!badge[v] && <span className={`ml-auto text-[10px] font-black px-1.5 rounded-md ${active ? 'bg-white/25' : 'bg-danger text-white'}`}>{badge[v]}</span>}
      </button>
    ) : (
      <button onClick={() => { setView(v); setMoreOpen(false); }} className={`relative flex flex-col items-center justify-center flex-1 py-2 gap-1 text-[9px] font-black uppercase tracking-wider ${active ? 'text-primary' : 'text-gray-400'}`}>
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
        <span className="leading-none">{me.role === 'CLIENT' && v === 'parc' ? 'Machines' : NAV[v].short}</span>
        {!!badge[v] && <span className="absolute top-1 right-[calc(50%-18px)] min-w-[14px] h-[14px] px-0.5 rounded-full bg-danger text-white text-[8px] flex items-center justify-center">{badge[v]}</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="bg-white border-b border-border px-4 lg:px-6 py-3 flex items-center justify-between gap-3 shrink-0 z-[400] print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Logo className="h-8" showText={false} />
          <div className="border-l border-border pl-3 min-w-0">
            <div className="text-sm font-black text-dark truncate">{g.tenantName || 'Maintenance'}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 truncate">{me.name} · {ROLE_LABEL[me.role]}{me.role === 'CLIENT' && me.clientId ? ` · ${g.clientName(me.clientId)}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {headerExtra}
          <NotificationsBell />
          <button onClick={onLogout} className="p-2.5 text-gray-400 hover:text-danger" aria-label="Déconnexion"><LogOut size={20} /></button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white border-r border-border p-3 gap-1 print:hidden">
          {views.map(v => <NavButton key={v} v={v} vertical />)}
        </aside>
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 lg:px-8 py-6 pb-28 lg:pb-10">
          {view === 'accueil' && <DashboardView />}
          {view === 'planning' && <PlanningView />}
          {view === 'interventions' && <WorkOrdersView />}
          {view === 'signalements' && <RequestsView />}
          {view === 'preventif' && <PreventiveView />}
          {view === 'parc' && <AssetsView />}
          {view === 'suivi' && <TrackingView />}
          {view === 'scanner' && <TerrainView />}
          {view === 'reglages' && <SettingsView />}
        </main>
      </div>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-border flex z-40 pb-[max(0.5rem,env(safe-area-inset-bottom))] print:hidden">
        {mobileMain.map(v => <NavButton key={v} v={v} />)}
        {mobileMore.length > 0 && (
          <button onClick={() => setMoreOpen(!moreOpen)} className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 text-[9px] font-black uppercase tracking-wider ${mobileMore.includes(view) ? 'text-primary' : 'text-gray-400'}`}>
            {moreOpen ? <X size={20} /> : <Menu size={20} />}<span>Plus</span>
          </button>
        )}
      </nav>
      {moreOpen && (
        <div className="lg:hidden fixed inset-x-3 bottom-20 bg-white rounded-3xl shadow-2xl border border-border p-2 z-50">
          {mobileMore.map(v => <NavButton key={v} v={v} vertical />)}
        </div>
      )}
    </div>
  );
};

export const GmaoShell: React.FC<ShellProps> = (props) => {
  const views = VIEWS_BY_ROLE[props.me.role];
  const storageKey = `miki_gmao_view_${props.me.id}`;
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(storageKey) as View | null;
      if (saved && views.includes(saved)) return saved;
    } catch { /* stockage indisponible */ }
    return views[0];
  });
  const [modal, setModal] = useState<{ type: 'asset' | 'wo' | 'req'; id: string } | null>(null);

  useEffect(() => { if (!views.includes(view)) setViewState(views[0]); }, [props.me.role]);

  const setView = (v: View) => {
    if (!views.includes(v)) return;
    setViewState(v);
    setModal(null);
    try { localStorage.setItem(storageKey, v); } catch { /* ignoré */ }
  };

  return (
    <GmaoProvider
      backend={props.backend}
      me={props.me}
      navigate={v => setView(v as View)}
      openAsset={id => setModal({ type: 'asset', id })}
      openWorkOrder={id => setModal({ type: 'wo', id })}
      openRequest={id => setModal({ type: 'req', id })}
    >
      <Body {...props} view={view} setView={setView} views={views} />
      {modal?.type === 'asset' && <AssetDetailModal key={modal.id} id={modal.id} onClose={() => setModal(null)} />}
      {modal?.type === 'wo' && <WorkOrderDetailModal key={modal.id} id={modal.id} onClose={() => setModal(null)} />}
      {modal?.type === 'req' && <RequestDetailModal key={modal.id} id={modal.id} onClose={() => setModal(null)} />}
    </GmaoProvider>
  );
};
