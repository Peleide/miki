/**
 * Données GMAO dans les émulateurs Firebase.
 * Pré-requis : `cd functions && npm run build`, puis `firebase emulators:start` dans un autre terminal.
 * Usage : node scripts/seedGmao.mjs
 *
 * Crée (mot de passe : password123) :
 *  - l'organisation de démonstration « Démo Services NC » (offre Pro) avec ~150 jours d'activité rejoués ;
 *  - une organisation vierge « Test WDP » (offre Pro, kits véhicules + nettoyage) pour saisir un vrai parc ;
 *  - un administrateur plateforme admin@miki.nc.
 */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

import { createRequire } from 'module';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { seedDemo } = require('../functions/lib/gmao/seed.js');
const { firestoreStore } = require('../functions/lib/gmao/firestoreStore.js');
const { handleGmaoAction } = require('../functions/lib/gmao/core.js');
const { planOf, DEFAULT_SETTINGS } = require('../functions/lib/gmao/model.js');

const app = initializeApp({ projectId: 'miki-suivi-materiel' });
const auth = getAuth(app);
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const ROLE = { TECHNICIAN: 'RESPONSABLE', AGENT: 'TECHNICIEN', CLIENT: 'CLIENT' };

async function upsertUser(tenantId, a, extra = {}) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(a.email)).uid;
    await auth.updateUser(uid, { password: 'password123', disabled: false });
  } catch {
    uid = (await auth.createUser({ email: a.email, password: 'password123', displayName: `${a.first} ${a.last}` })).uid;
  }
  await db.collection('users').doc(uid).set({
    id: uid, email: a.email, firstName: a.first, lastName: a.last, role: a.role,
    tenantsAccess: { [tenantId]: a.role }, accessibleTenantIds: [tenantId],
    isArchived: false, isDisabled: false, mustChangePassword: false, ...extra,
  });
  return { id: uid, name: `${a.first} ${a.last}`, role: ROLE[a.role] };
}

async function wipe(tenantId) {
  const colls = ['gmaoAssets', 'gmaoAssetEvents', 'gmaoRequests', 'gmaoWorkOrders', 'gmaoPmPlans', 'gmaoTasks', 'gmaoTypologies', 'gmaoClients', 'checklists', 'sites', 'counters'];
  for (const c of colls) {
    const snap = await db.collection('tenants').doc(tenantId).collection(c).get();
    for (const d of snap.docs) await d.ref.delete();
  }
  const qr = await db.collection('gmaoQr').where('tenantId', '==', tenantId).get();
  for (const d of qr.docs) await d.ref.delete();
}

async function tenant(id, name, tier) {
  await db.collection('tenants').doc(id).set({
    id, name, status: 'ACTIVE', timezone: 'Pacific/Noumea', modules: { gmao: true }, plan: planOf(tier),
    gmao: { ...DEFAULT_SETTINGS }, quotas: { equipments: planOf(tier).maxAssets, users: 50 },
  });
  await wipe(id);
}

// ── Administrateur plateforme ──
{
  let uid;
  try { uid = (await auth.getUserByEmail('admin@miki.nc')).uid; await auth.updateUser(uid, { password: 'password123' }); }
  catch { uid = (await auth.createUser({ email: 'admin@miki.nc', password: 'password123', displayName: 'Super Admin' })).uid; }
  await db.collection('users').doc(uid).set({ id: uid, email: 'admin@miki.nc', firstName: 'Super', lastName: 'Admin', role: 'ADMIN', tenantsAccess: { platform: 'ADMIN' }, accessibleTenantIds: ['platform'], isArchived: false, isDisabled: false, mustChangePassword: false });
  console.log('✓ admin@miki.nc (console plateforme)');
}

// ── Démo Services NC ──
console.log('→ Démo Services NC (≈ 1 à 2 min)');
await tenant('demo', 'Démo Services NC', 'PRO');
const resp = await upsertUser('demo', { email: 'resp@demo.test', first: 'Alex', last: 'Martin', role: 'TECHNICIAN' });
const tom = await upsertUser('demo', { email: 'tom@demo.test', first: 'Tom', last: 'Leroy', role: 'AGENT' });
const yann = await upsertUser('demo', { email: 'yann@demo.test', first: 'Yann', last: 'Kaipo', role: 'AGENT' });
const leaRef = { email: 'lea@demo.test', first: 'Léa', last: 'Morel', role: 'CLIENT' };
const lea = await upsertUser('demo', leaRef);
await seedDemo(firestoreStore(db, 'demo'), { responsable: resp, techniciens: [tom, yann], client: lea }, new Date(), async clientId => {
  await db.collection('users').doc(lea.id).set({ gmaoClientIds: { demo: clientId } }, { merge: true });
});
console.log('  ✓ resp@demo.test (responsable) · tom@demo.test · yann@demo.test (techniciens) · lea@demo.test (cliente)');

// ── Test WDP : organisation vierge ──
console.log('→ Test WDP (vierge)');
await tenant('wdp', 'Test WDP', 'PRO');
const wdpResp = await upsertUser('wdp', { email: 'responsable@wdp.test', first: 'Responsable', last: 'WDP', role: 'TECHNICIAN' });
await upsertUser('wdp', { email: 'technicien@wdp.test', first: 'Technicien', last: 'WDP', role: 'AGENT' });
const ctx = { store: firestoreStore(db, 'wdp'), actor: { id: wdpResp.id, name: wdpResp.name, role: 'RESPONSABLE' }, now: new Date(), effects: [] };
await handleGmaoAction(ctx, 'SITE_SAVE', { name: 'Dépôt' });
for (const kitId of ['VEHICULES', 'NETTOYAGE']) await handleGmaoAction(ctx, 'KIT_APPLY', { kitId });
console.log('  ✓ responsable@wdp.test · technicien@wdp.test');

console.log('✓ Terminé. Mot de passe : password123');
process.exit(0);
