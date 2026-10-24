/**
 * Seed de démonstration GMAO CSP dans l'émulateur Firebase.
 * Pré-requis : `cd functions && npm run build` puis `firebase emulators:start`.
 * Usage : node scripts/seedCsp.mjs
 *
 * Crée le tenant `csp`, 5 comptes (mot de passe : password123) et rejoue ~90 jours d'activité
 * (parc, demandes, bons de travail, préventif, planning) via la même logique que les Cloud Functions.
 */
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import { createRequire } from 'module';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { seedCspDemo } = require('../functions/lib/gmao/seed.js');
const { firestoreStore } = require('../functions/lib/gmao/firestoreStore.js');

const app = initializeApp({ projectId: 'miki-suivi-materiel' });
const auth = getAuth(app);
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const TENANT = 'csp';
const ACCOUNTS = [
  { email: 'resp@csp.test', first: 'Alex', last: 'Martin', role: 'TECHNICIAN' },
  { email: 'tech1@csp.test', first: 'Tom', last: 'Leroy', role: 'AGENT' },
  { email: 'tech2@csp.test', first: 'Yann', last: 'Kaipo', role: 'AGENT' },
  { email: 'tech3@csp.test', first: 'Rémi', last: 'Hnace', role: 'AGENT' },
  { email: 'demandeur@csp.test', first: 'Léa', last: 'Morel', role: 'CLIENT' },
];

async function upsertUser(a) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(a.email)).uid;
    await auth.updateUser(uid, { password: 'password123' });
  } catch {
    uid = (await auth.createUser({ email: a.email, password: 'password123', displayName: `${a.first} ${a.last}` })).uid;
  }
  await db.collection('users').doc(uid).set({
    id: uid, email: a.email, firstName: a.first, lastName: a.last, role: a.role,
    tenantsAccess: { [TENANT]: a.role }, accessibleTenantIds: [TENANT],
    isArchived: false, isDisabled: false, mustChangePassword: false,
  }, { merge: true });
  return { id: uid, name: `${a.first} ${a.last}`, role: a.role === 'TECHNICIAN' ? 'RESPONSABLE' : a.role === 'AGENT' ? 'TECHNICIEN' : 'DEMANDEUR' };
}

async function wipeTenantGmao() {
  const colls = ['gmaoAssets', 'gmaoAssetEvents', 'gmaoRequests', 'gmaoWorkOrders', 'gmaoPmPlans', 'gmaoTasks', 'checklists', 'sites', 'counters'];
  for (const c of colls) {
    const snap = await db.collection('tenants').doc(TENANT).collection(c).get();
    for (const d of snap.docs) await d.ref.delete();
  }
}

console.log('→ Tenant CSP');
await db.collection('tenants').doc(TENANT).set({
  id: TENANT, name: 'CSP · Maintenance', status: 'ACTIVE', timezone: 'Pacific/Noumea',
  quotas: { equipments: 400, users: 30 },
  modules: { gmao: true },
}, { merge: true });
await wipeTenantGmao();

console.log('→ Comptes');
const users = [];
for (const a of ACCOUNTS) { users.push(await upsertUser(a)); console.log(`  ✓ ${a.email}`); }

console.log('→ Données (≈ 1 min)');
await seedCspDemo(firestoreStore(db, TENANT), {
  responsable: users[0],
  techniciens: users.slice(1, 4),
  demandeur: users[4],
});
console.log('✓ Terminé. Connexion : resp@csp.test / password123 (responsable), tech1@csp.test (technicien), demandeur@csp.test');
process.exit(0);
