import type { Firestore } from 'firebase-admin/firestore';
import { CollName, DEFAULT_SETTINGS, GmaoSettings, GmaoUser, ROLE_FROM_MIKI } from './model';
import type { GmaoStore } from './core';

export function firestoreStore(db: Firestore, tenantId: string): GmaoStore {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const coll = (name: CollName) => tenantRef.collection(name);
  let usersCache: GmaoUser[] | null = null;

  return {
    async get<T>(c: CollName, id: string) {
      if (!id) return null;
      const snap = await coll(c).doc(id).get();
      return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
    },
    async list<T>(c: CollName) {
      const snap = await coll(c).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
    },
    async set(c, id, data) { await coll(c).doc(id).set({ ...data, tenantId }); },
    async update(c, id, data) { await coll(c).doc(id).update(data); },
    async remove(c, id) { await coll(c).doc(id).delete(); },
    newId(c) { return coll(c).doc().id; },
    async nextNumber(key: string) {
      const ref = tenantRef.collection('counters').doc('gmao');
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const n = ((snap.exists ? snap.data()?.[key] : 0) || 0) + 1;
        tx.set(ref, { [key]: n }, { merge: true });
        return n;
      });
    },
    async getSettings() {
      const snap = await tenantRef.get();
      return { ...DEFAULT_SETTINGS, ...(snap.data()?.gmao || {}) } as GmaoSettings;
    },
    async saveSettings(s: GmaoSettings) {
      await tenantRef.set({ gmao: s }, { merge: true });
    },
    async getUsers() {
      if (usersCache) return usersCache;
      const snap = await db.collection('users').where('accessibleTenantIds', 'array-contains', tenantId).get();
      usersCache = snap.docs
        .map(d => ({ ...d.data(), id: d.id }) as any)
        .filter(u => !u.isArchived && !u.isDisabled)
        .map(u => ({
          id: u.id,
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          role: ROLE_FROM_MIKI[u.tenantsAccess?.[tenantId] || u.role] || 'DEMANDEUR',
        }));
      return usersCache;
    },
  };
}
