import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Asset, AssetEvent, CalendarTask, COLL, DEFAULT_SETTINGS, GmaoChecklist, GmaoClient, GmaoNotification, GmaoRole,
  GmaoSettings, GmaoSite, GmaoUser, PmPlan, TenantPlan, Typology, WorkOrder, WorkRequest,
} from '../../functions/src/gmao/model';
import { inPerimeter } from '../../functions/src/gmao/rules';
import { GmaoBackend } from '../../services/gmao/backend';
import { useDialog } from '../../hooks/useDialog';

export interface GmaoData {
  backend: GmaoBackend;
  me: GmaoUser;
  role: GmaoRole;
  isResp: boolean;
  isTech: boolean;
  isClient: boolean;
  loading: boolean;
  tenantName: string;
  plan: TenantPlan | null;
  assets: Asset[];
  events: AssetEvent[];
  sites: GmaoSite[];
  requests: WorkRequest[];
  workOrders: WorkOrder[];
  pmPlans: PmPlan[];
  tasks: CalendarTask[];
  checklists: GmaoChecklist[];
  typologies: Typology[];
  clients: GmaoClient[];
  settings: GmaoSettings;
  users: GmaoUser[];
  notifications: GmaoNotification[];
  assetById: (id?: string | null) => Asset | undefined;
  siteName: (id?: string | null) => string;
  typologyName: (id?: string | null) => string;
  clientName: (id?: string | null) => string;
  /** Machine dans le périmètre de l'utilisateur (technicien : son parc ; autres : tout ce qu'il voit). */
  mine: (a?: Asset) => boolean;
  /** Le technicien peut-il gérer son planning lui-même ? */
  canPlan: boolean;
  /** Exécute une action métier ; affiche l'erreur et renvoie null en cas d'échec. */
  run: (action: string, payload?: any, successMsg?: string) => Promise<any | null>;
  toast: (msg: string, type?: 'error' | 'success' | 'info') => void;
  confirm: ReturnType<typeof useDialog>['confirm'];
  prompt: ReturnType<typeof useDialog>['prompt'];
  openAsset: (id: string) => void;
  openWorkOrder: (id: string) => void;
  openRequest: (id: string) => void;
  navigate: (view: string) => void;
}

const Ctx = createContext<GmaoData | null>(null);

export function useGmao(): GmaoData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGmao hors GmaoProvider');
  return v;
}

interface ProviderProps {
  backend: GmaoBackend;
  me: GmaoUser;
  children: React.ReactNode;
  navigate: (view: string) => void;
  openAsset: (id: string) => void;
  openWorkOrder: (id: string) => void;
  openRequest: (id: string) => void;
}

function useCollection<T>(backend: GmaoBackend, coll: any, setLoaded: (k: string) => void): T[] {
  const [docs, setDocs] = useState<T[]>([]);
  useEffect(() => backend.subscribe<T>(coll, d => { setDocs(d); setLoaded(coll); }), [backend, coll]);
  return docs;
}

export const GmaoProvider: React.FC<ProviderProps> = ({ backend, me, children, navigate, openAsset, openWorkOrder, openRequest }) => {
  const { toast, confirm, prompt, dialogNode } = useDialog();
  const [loaded, setLoadedState] = useState<Record<string, boolean>>({});
  const setLoaded = useCallback((k: string) => setLoadedState(prev => (prev[k] ? prev : { ...prev, [k]: true })), []);

  const assets = useCollection<Asset>(backend, COLL.assets, setLoaded);
  const events = useCollection<AssetEvent>(backend, COLL.assetEvents, setLoaded);
  const sites = useCollection<GmaoSite>(backend, COLL.sites, setLoaded);
  const requests = useCollection<WorkRequest>(backend, COLL.requests, setLoaded);
  const workOrders = useCollection<WorkOrder>(backend, COLL.workOrders, setLoaded);
  const pmPlans = useCollection<PmPlan>(backend, COLL.pmPlans, setLoaded);
  const tasks = useCollection<CalendarTask>(backend, COLL.tasks, setLoaded);
  const rawChecklists = useCollection<GmaoChecklist>(backend, COLL.checklists, setLoaded);
  const typologies = useCollection<Typology>(backend, COLL.typologies, setLoaded);
  const clients = useCollection<GmaoClient>(backend, COLL.clients, setLoaded);
  const [settings, setSettings] = useState<GmaoSettings>(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [users, setUsers] = useState<GmaoUser[]>([]);
  const [notifications, setNotifications] = useState<GmaoNotification[]>([]);

  useEffect(() => backend.subscribeTenant(t => { setSettings(t.settings); setPlan(t.plan); setTenantName(t.name); }), [backend]);
  useEffect(() => backend.subscribeNotifications(me.id, setNotifications), [backend, me.id]);
  useEffect(() => { backend.listUsers().then(setUsers).catch(() => setUsers([me])); }, [backend, me.id]);

  const checklists = useMemo(
    () => rawChecklists
      .filter(c => !c.isArchived && Array.isArray(c.items))
      .map(c => ({ ...c, kind: c.kind || (c.triggerType === 'SAFETY' ? 'SECURITE' : 'MAINTENANCE') }) as GmaoChecklist),
    [rawChecklists],
  );

  const assetMap = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  const siteMap = useMemo(() => new Map(sites.map(s => [s.id, s.name])), [sites]);
  const typMap = useMemo(() => new Map(typologies.map(t => [t.id, t.name])), [typologies]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients]);

  const run = useCallback(async (action: string, payload?: any, successMsg?: string) => {
    try {
      const res = await backend.call(action, payload);
      if (successMsg) toast(successMsg, 'success');
      return res ?? {};
    } catch (e: any) {
      toast(e?.message || 'Erreur inattendue.');
      return null;
    }
  }, [backend, toast]);

  const isTech = me.role === 'TECHNICIEN';
  const value: GmaoData = {
    backend, me, role: me.role,
    isResp: me.role === 'RESPONSABLE',
    isTech,
    isClient: me.role === 'CLIENT',
    loading: !(loaded[COLL.assets] && loaded[COLL.workOrders] && loaded[COLL.requests]),
    tenantName, plan,
    assets, events, sites, requests, workOrders, pmPlans, tasks, checklists, typologies, clients, settings, users, notifications,
    assetById: (id) => (id ? assetMap.get(id) : undefined),
    siteName: (id) => (id ? siteMap.get(id) || '—' : '—'),
    typologyName: (id) => (id ? typMap.get(id) || '—' : '—'),
    clientName: (id) => (id ? clientMap.get(id) || '—' : '—'),
    mine: (a) => !!a && (!isTech || inPerimeter(a, me.id)),
    canPlan: me.role === 'RESPONSABLE' || (isTech && settings.techniciansSelfPlan),
    run, toast, confirm, prompt, openAsset, openWorkOrder, openRequest, navigate,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {dialogNode}
    </Ctx.Provider>
  );
};
