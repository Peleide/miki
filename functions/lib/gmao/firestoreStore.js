"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestoreStore = firestoreStore;
const model_1 = require("./model");
function firestoreStore(db, tenantId) {
    const tenantRef = db.collection('tenants').doc(tenantId);
    const coll = (name) => tenantRef.collection(name);
    let usersCache = null;
    return {
        async get(c, id) {
            if (!id)
                return null;
            const snap = await coll(c).doc(id).get();
            return snap.exists ? { id: snap.id, ...snap.data() } : null;
        },
        async list(c) {
            const snap = await coll(c).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async set(c, id, data) { await coll(c).doc(id).set({ ...data, tenantId }); },
        async update(c, id, data) { await coll(c).doc(id).update(data); },
        async remove(c, id) { await coll(c).doc(id).delete(); },
        newId(c) { return coll(c).doc().id; },
        async nextNumber(key) {
            const ref = tenantRef.collection('counters').doc('gmao');
            return db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const n = ((snap.exists ? snap.data()?.[key] : 0) || 0) + 1;
                tx.set(ref, { [key]: n }, { merge: true });
                return n;
            });
        },
        async getSettings() {
            const snap = await tenantRef.get();
            return { ...model_1.DEFAULT_SETTINGS, ...(snap.data()?.gmao || {}) };
        },
        async saveSettings(s) {
            await tenantRef.set({ gmao: s }, { merge: true });
        },
        async getUsers() {
            if (usersCache)
                return usersCache;
            const snap = await db.collection('users').where('accessibleTenantIds', 'array-contains', tenantId).get();
            usersCache = snap.docs
                .map(d => ({ ...d.data(), id: d.id }))
                .filter(u => !u.isArchived && !u.isDisabled)
                .map(u => ({
                id: u.id,
                name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                role: model_1.ROLE_FROM_MIKI[u.tenantsAccess?.[tenantId] || u.role] || 'DEMANDEUR',
            }));
            return usersCache;
        },
    };
}
//# sourceMappingURL=firestoreStore.js.map