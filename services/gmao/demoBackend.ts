// Mode démo : toute la GMAO tourne dans le navigateur, sans Firebase.
// La logique métier exécutée est exactement celle des Cloud Functions (functions/src/gmao/core.ts).
import { Actor, Ctx, handleGmaoAction, handlePublicAction, runPreventiveScan } from '../../functions/src/gmao/core';
import { memoryStore, emptyState, MemoryState } from '../../functions/src/gmao/memoryStore';
import { seedDemo } from '../../functions/src/gmao/seed';
import { CLIENT_SCOPED, COLL, CollName, GmaoNotification, GmaoUser, SHARED_COLLS, planOf, withDefaults } from '../../functions/src/gmao/model';
import { GmaoBackend, PublicBackend, compressImage } from './backend';

const STORAGE_KEY = 'miki_gmao_demo_v2';
export const DEMO_ORG = 'Démo Services NC';

const BASE_USERS: GmaoUser[] = [
  { id: 'demo-resp', name: 'Alex Martin', role: 'RESPONSABLE' },
  { id: 'demo-tech1', name: 'Tom Leroy', role: 'TECHNICIEN' },
  { id: 'demo-tech2', name: 'Yann Kaipo', role: 'TECHNICIEN' },
  { id: 'demo-client', name: 'Léa Morel', role: 'CLIENT', clientId: null },
];

interface DemoState extends MemoryState {
  notifications: Record<string, GmaoNotification[]>;
  seededAt: string;
}

type Listener = () => void;

class DemoEngine {
  state!: DemoState;
  private listeners = new Map<string, Set<Listener>>();
  ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  get users(): GmaoUser[] { return this.state?.users || BASE_USERS; }

  private async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.state = JSON.parse(raw);
        await this.dailyScan();
        return;
      }
    } catch { /* stockage indisponible : on repart d'un jeu neuf */ }
    await this.reset(false);
  }

  async reset(notify = true) {
    const base = emptyState(JSON.parse(JSON.stringify(BASE_USERS)), planOf('PRO'), DEMO_ORG) as DemoState;
    base.notifications = {};
    base.seededAt = new Date().toISOString();
    const store = memoryStore(base);
    await seedDemo(store, { responsable: base.users[0], techniciens: [base.users[1], base.users[2]], client: base.users[3] }, new Date(), cid => { base.users[3].clientId = cid; });
    this.state = base;
    this.persist();
    if (notify) this.emitAll();
  }

  /** Équivalent de la tâche planifiée quotidienne. */
  private async dailyScan() {
    const ctx: Ctx = { store: this.store(), actor: { id: 'system', name: 'Planification automatique', role: 'RESPONSABLE' }, now: new Date(), effects: [] };
    await runPreventiveScan(ctx);
    this.applyEffects(ctx);
    this.persist();
  }

  store() {
    return memoryStore(this.state, coll => this.emit(coll));
  }

  persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* quota : la démo continue en mémoire */ }
  }

  on(key: string, l: Listener) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(l);
    return () => { this.listeners.get(key)?.delete(l); };
  }

  emit(key: string) {
    this.listeners.get(key)?.forEach(l => l());
  }

  emitAll() {
    this.listeners.forEach(set => set.forEach(l => l()));
  }

  applyEffects(ctx: Ctx) {
    const push = (userId: string, title: string, message: string, type: GmaoNotification['type']) => {
      const list = this.state.notifications[userId] || (this.state.notifications[userId] = []);
      list.unshift({ id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title, message, type, read: false, timestamp: new Date().toISOString() });
      this.emit(`notif:${userId}`);
    };
    for (const e of ctx.effects) {
      if (e.type === 'notifyManagers') this.users.filter(u => u.role === 'RESPONSABLE' && u.id !== ctx.actor.id).forEach(u => push(u.id, e.title, e.message, e.level));
      if (e.type === 'notifyUser') push(e.userId, e.title, e.message, e.level);
    }
  }
}

let engine: DemoEngine | null = null;
export function getDemoEngine() {
  if (!engine) engine = new DemoEngine();
  return engine;
}

export function demoBackend(actor: Actor): GmaoBackend {
  const eng = getDemoEngine();
  const isClient = actor.role === 'CLIENT';
  const visible = (coll: CollName, docs: any[]) => {
    if (!isClient) return docs;
    if (CLIENT_SCOPED.includes(coll)) return docs.filter(d => d.clientId && d.clientId === actor.clientId);
    if (coll === COLL.clients) return docs.filter(d => d.id === actor.clientId);
    if (SHARED_COLLS.includes(coll)) return docs;
    return [];
  };
  return {
    mode: 'demo',
    tenantId: 'demo',
    async call(action, payload) {
      await eng.ready;
      const ctx: Ctx = { store: eng.store(), actor, now: new Date(), effects: [] };
      const result = await handleGmaoAction(ctx, action, payload);
      eng.applyEffects(ctx);
      eng.persist();
      return result;
    },
    subscribe(coll: CollName, cb) {
      let active = true;
      const push = () => { if (active) cb(visible(coll, Object.values(eng.state.collections[coll] || {}).map(v => ({ ...v }))) as any); };
      eng.ready.then(push);
      const off = eng.on(coll, push);
      return () => { active = false; off(); };
    },
    subscribeTenant(cb) {
      const push = () => cb({ name: eng.state.tenantName, plan: eng.state.plan, settings: withDefaults(eng.state.settings) });
      eng.ready.then(push);
      return eng.on('settings', push);
    },
    subscribeNotifications(userId, cb) {
      const push = () => cb([...(eng.state.notifications?.[userId] || [])]);
      eng.ready.then(push);
      return eng.on(`notif:${userId}`, push);
    },
    async markNotificationRead(userId, id) {
      (eng.state.notifications[userId] || []).forEach(n => { if (n.id === id) n.read = true; });
      eng.persist(); eng.emit(`notif:${userId}`);
    },
    async markAllNotificationsRead(userId) {
      (eng.state.notifications[userId] || []).forEach(n => { n.read = true; });
      eng.persist(); eng.emit(`notif:${userId}`);
    },
    async listUsers() { await eng.ready; return isClient ? eng.users.filter(u => u.id === actor.id) : eng.users; },
    async upload(_folder, file) {
      if (file.type.startsWith('image/')) {
        const blob = await compressImage(file, 900, 0.65);
        return await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.readAsDataURL(blob);
        });
      }
      // Documents (PDF…) : conservés le temps de la session uniquement
      return URL.createObjectURL(file);
    },
    publicOrigin: () => window.location.origin,
    accounts: {
      async list() {
        await eng.ready;
        return eng.users.map(u => ({ id: u.id, name: u.name, email: `${u.name.split(' ')[0].toLowerCase()}@demo.miki.nc`, role: u.role, clientId: u.clientId || null, isDisabled: false }));
      },
      async create() { throw new Error('Mode démo : les comptes sont fictifs, changez de profil en haut de l’écran.'); },
      async resetPassword() { throw new Error('Mode démo : pas de mot de passe.'); },
      async setDisabled() { throw new Error('Mode démo : comptes fictifs.'); },
    },
  };
}

export function demoPublicBackend(): PublicBackend {
  const eng = getDemoEngine();
  const run = async (action: string, payload: any) => {
    await eng.ready;
    const ctx: Ctx = { store: eng.store(), actor: { id: 'public', name: String(payload?.name || 'Anonyme'), role: 'CLIENT', clientId: null }, now: new Date(), effects: [] };
    const res = await handlePublicAction(ctx, action, payload);
    eng.applyEffects(ctx);
    eng.persist();
    return res;
  };
  return {
    info: token => run('INFO', { token }),
    report: (token, payload) => run('REPORT', { ...payload, token }),
  };
}

export async function demoUsers(): Promise<GmaoUser[]> {
  const eng = getDemoEngine();
  await eng.ready;
  return eng.users;
}
