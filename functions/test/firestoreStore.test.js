// Vérifie la couche Firestore (firestoreStore) avec une imitation minimale de l'API firebase-admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { firestoreStore } = require('../lib/gmao/firestoreStore');
const { seedDemo } = require('../lib/gmao/seed');
const { planOf } = require('../lib/gmao/model');

function fakeFirestore() {
  const data = new Map(); // chemin → objet
  let auto = 0;
  const docRef = path => ({
    id: path.split('/').pop(),
    path,
    async get() { const v = data.get(path); return { exists: v !== undefined, id: path.split('/').pop(), data: () => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))), ref: docRef(path) }; },
    async set(v, opts) {
      const clean = JSON.parse(JSON.stringify(v));
      data.set(path, opts?.merge ? { ...(data.get(path) || {}), ...clean } : clean);
    },
    async update(v) { if (!data.has(path)) throw new Error(`NOT_FOUND ${path}`); data.set(path, { ...data.get(path), ...JSON.parse(JSON.stringify(v)) }); },
    async delete() { data.delete(path); },
    collection: name => collRef(`${path}/${name}`),
  });
  const children = path => [...data.entries()].filter(([k]) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1);
  const collRef = path => ({
    doc: id => docRef(`${path}/${id || `auto${++auto}`}`),
    where: (field, op, value) => ({
      async get() {
        const docs = children(path).filter(([, v]) => Array.isArray(v[field]) && v[field].includes(value));
        return { docs: docs.map(([k, v]) => ({ id: k.split('/').pop(), data: () => v, ref: docRef(k) })) };
      },
    }),
    async get() {
      const docs = children(path);
      return { docs: docs.map(([k, v]) => ({ id: k.split('/').pop(), data: () => v, ref: docRef(k) })), empty: !docs.length };
    },
  });
  return {
    data,
    collection: collRef,
    async runTransaction(fn) {
      return fn({ get: ref => ref.get(), set: (ref, v, o) => ref.set(v, o) });
    },
  };
}

test('firestoreStore : la démo se construit sur une base Firestore simulée, avec l’index des QR codes', async () => {
  const db = fakeFirestore();
  await db.collection('tenants').doc('demo').set({ name: 'Démo Services', plan: planOf('PRO'), modules: { gmao: true } });
  const users = [
    { uid: 'u1', first: 'Alex', last: 'Martin', role: 'TECHNICIAN' },
    { uid: 'u2', first: 'Tom', last: 'Leroy', role: 'AGENT' },
    { uid: 'u3', first: 'Yann', last: 'Kaipo', role: 'AGENT' },
    { uid: 'u4', first: 'Léa', last: 'Morel', role: 'CLIENT' },
  ];
  for (const u of users) await db.collection('users').doc(u.uid).set({ firstName: u.first, lastName: u.last, role: u.role, tenantsAccess: { demo: u.role }, accessibleTenantIds: ['demo'] });
  const store = firestoreStore(db, 'demo');
  const gu = await store.getUsers();
  assert.deepEqual(gu.map(u => u.role), ['RESPONSABLE', 'TECHNICIEN', 'TECHNICIEN', 'CLIENT']);
  assert.equal((await store.getTenantInfo()).plan.maxAssets, 60);
  await seedDemo(store, { responsable: gu[0], techniciens: gu.slice(1, 3), client: gu[3] });
  const keys = [...db.data.keys()];
  const count = c => keys.filter(k => k.startsWith(`${c}/`)).length;
  assert.ok(count('tenants/demo/gmaoAssets') >= 14);
  assert.equal(count('gmaoQr'), count('tenants/demo/gmaoAssets'), 'chaque machine est indexée par son jeton QR');
  const anyWo = keys.find(k => k.startsWith('tenants/demo/gmaoWorkOrders/'));
  assert.equal(db.data.get(anyWo).tenantId, 'demo');
});
