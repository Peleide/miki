// Stockage en mémoire : mode démo du front et tests de la logique métier.
import { CollName, DEFAULT_SETTINGS, GmaoSettings, GmaoUser, TenantPlan, withDefaults } from './model';
import type { GmaoStore } from './core';

export interface MemoryState {
  collections: Record<string, Record<string, any>>;
  counters: Record<string, number>;
  settings: GmaoSettings;
  users: GmaoUser[];
  tenantName: string;
  plan: TenantPlan | null;
}

export function emptyState(users: GmaoUser[] = [], plan: TenantPlan | null = null, tenantName = 'Démo'): MemoryState {
  return { collections: {}, counters: {}, settings: { ...DEFAULT_SETTINGS }, users, tenantName, plan };
}

const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function memoryStore(state: MemoryState, onChange?: (coll: string) => void): GmaoStore {
  const c = (name: string) => (state.collections[name] = state.collections[name] || {});
  let seq = 0;
  return {
    async get<T>(coll: CollName, id: string) { return id && c(coll)[id] ? copy(c(coll)[id]) as T : null; },
    async list<T>(coll: CollName) { return Object.values(c(coll)).map(v => copy(v)) as T[]; },
    async set(coll, id, data) { c(coll)[id] = { ...copy(data), id }; onChange?.(coll); },
    async update(coll, id, data) {
      if (!c(coll)[id]) throw new Error(`Document ${coll}/${id} introuvable`);
      c(coll)[id] = { ...c(coll)[id], ...copy(data) };
      onChange?.(coll);
    },
    async remove(coll, id) { delete c(coll)[id]; onChange?.(coll); },
    newId(coll) { seq++; return `${coll.replace('gmao', '').toLowerCase()}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`; },
    async nextNumber(key) { state.counters[key] = (state.counters[key] || 0) + 1; return state.counters[key]; },
    async getSettings() { return withDefaults(state.settings); },
    async saveSettings(s) { state.settings = copy(s); onChange?.('settings'); },
    async getUsers() { return copy(state.users); },
    async getTenantInfo() { return { name: state.tenantName || 'Démo', plan: state.plan ? copy(state.plan) : null }; },
    async registerQr() { /* l'index global n'existe qu'en production */ },
  };
}
