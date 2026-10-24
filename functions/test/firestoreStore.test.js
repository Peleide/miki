// Vérifie la couche Firestore (firestoreStore) avec une imitation minimale de l'API firebase-admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { firestoreStore } = require('../lib/gmao/firestoreStore');
const { seedCspDemo } = require('../lib/gmao/seed');

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
  const collRef = path => ({
    doc: id => docRef(`${path}/${id || `auto${++auto}`}`),
    where: (field, op, value) => ({
      async get() {
        const docs = [...data.entries()].filter(([k, v]) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1 && Array.isArray(v[field]) && v[field].includes(value));
        return { docs: docs.map(([k, v]) => ({ id: k.split('/').pop(), data: () => v, ref: docRef(k) })) };
      },
    }),
    async get() {
      const docs = [...data.entries()].filter(([k]) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1);
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

test('firestoreStore : le jeu CSP se construit sur une base Firestore simulée', async () => {
  const db = fakeFirestore();
  const users = [
    { uid: 'u1', first: 'Alex', last: 'Martin', role: 'TECHNICIAN' },
    { uid: 'u2', first: 'Tom', last: 'Leroy', role: 'AGENT' },
    { uid: 'u3', first: 'Yann', last: 'Kaipo', role: 'AGENT' },
    { uid: 'u4', first: 'Rémi', last: 'Hnace', role: 'AGENT' },
    { uid: 'u5', first: 'Léa', last: 'Morel', role: 'CLIENT' },
  ];
  for (const u of users) await db.collection('users').doc(u.uid).set({ firstName: u.first, lastName: u.last, role: u.role, tenantsAccess: { csp: u.role }, accessibleTenantIds: ['csp'] });
  const store = firestoreStore(db, 'csp');
  const gu = await store.getUsers();
  assert.deepEqual(gu.map(u => u.role), ['RESPONSABLE', 'TECHNICIEN', 'TECHNICIEN', 'TECHNICIEN', 'DEMANDEUR']);
  await seedCspDemo(store, { responsable: gu[0], techniciens: gu.slice(1, 4), demandeur: gu[4] });
  const keys = [...db.data.keys()];
  const count = c => keys.filter(k => k.startsWith(`tenants/csp/${c}/`)).length;
  assert.ok(count('gmaoAssets') >= 20);
  assert.ok(count('gmaoWorkOrders') >= 30);
  assert.equal(count('gmaoTasks'), 5);
  const counters = db.data.get('tenants/csp/counters/gmao');
  assert.ok(counters[`BT-${new Date().getFullYear()}`] >= 30, 'compteur BT transactionnel');
  const settings = db.data.get('tenants/csp').gmao;
  assert.equal(settings.hourlyRate, 5500);
  assert.ok(settings.safetyChecklistId);
  // chaque document porte son tenantId
  assert.ok(keys.filter(k => k.startsWith('tenants/csp/gmao')).every(k => db.data.get(k).tenantId === 'csp'));
});
