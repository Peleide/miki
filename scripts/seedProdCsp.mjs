/**
 * Démo CSP en production (données fictives) : tenant `csp`, profils d'équipe fictifs SANS compte de connexion.
 * Le jeu est généré en mémoire (même cœur que les Cloud Functions) puis écrit via l'API REST Firestore.
 * Usage (PowerShell) : $env:GTOKEN = gcloud auth print-access-token; node scripts/seedProdCsp.mjs
 * Connexion pour la démo : compte administrateur plateforme, puis choisir l'organisation « CSP · Maintenance ».
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { seedCspDemo } = require('../functions/lib/gmao/seedCsp.js');
const { memoryStore, emptyState } = require('../functions/lib/gmao/memoryStore.js');
const { planOf, ROLE_FROM_MIKI } = require('../functions/lib/gmao/model.js');

const PROJECT = 'miki-suivi-materiel';
const TENANT = 'csp';
const TOKEN = process.env.GTOKEN;
if (!TOKEN) { console.error('GTOKEN manquant'); process.exit(1); }
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const docName = (path) => `projects/${PROJECT}/databases/(default)/documents/${path}`;

const PEOPLE = [
  { id: 'csp-demo-resp', first: 'Responsable', last: 'maintenance', miki: 'TECHNICIAN' },
  { id: 'csp-demo-jordan', first: 'Jordan', last: 'P.', miki: 'AGENT' },
  { id: 'csp-demo-steeve', first: 'Steeve', last: 'T.', miki: 'AGENT' },
  { id: 'csp-demo-willy', first: 'Willy', last: 'K.', miki: 'AGENT' },
  { id: 'csp-demo-exploit', first: "Chef d'exploitation", last: 'Gadji', miki: 'CLIENT' },
];
const users = PEOPLE.map(p => ({ id: p.id, name: `${p.first} ${p.last}`, role: ROLE_FROM_MIKI[p.miki], clientId: null }));
const plan = { ...planOf('SUR_MESURE'), maxTechnicians: 8, maxAssets: 300, maxClients: 5, maxManagers: 3 };
const state = emptyState(users, plan, 'CSP · Maintenance');
const { clientId } = await seedCspDemo(memoryStore(state), { responsable: users[0], techniciens: users.slice(1, 4), client: users[4] }, new Date(), id => { users[4].clientId = id; });

const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, val(v)]));

const writes = [];
const put = (path, data) => writes.push({ update: { name: docName(path), fields: fields(data) } });

put(`tenants/${TENANT}`, {
  id: TENANT, name: 'CSP · Maintenance', status: 'ACTIVE', timezone: 'Pacific/Noumea', createdAt: new Date(),
  modules: { gmao: true }, plan, gmao: state.settings, quotas: { equipments: plan.maxAssets, users: 30 }, isDemo: true,
});
for (const p of PEOPLE) {
  put(`users/${p.id}`, {
    id: p.id, email: `${p.id}@demo.invalid`, firstName: p.first, lastName: p.last, role: p.miki,
    tenantId: TENANT, tenantsAccess: { [TENANT]: p.miki }, accessibleTenantIds: [TENANT],
    ...(p.miki === 'CLIENT' ? { gmaoClientIds: { [TENANT]: clientId } } : {}),
    isArchived: false, isDisabled: false, mustChangePassword: false, isDemoProfile: true,
  });
}
for (const [coll, docs] of Object.entries(state.collections)) {
  for (const [id, data] of Object.entries(docs)) put(`tenants/${TENANT}/${coll}/${id}`, data);
}
put(`tenants/${TENANT}/counters/gmao`, state.counters);
for (const a of Object.values(state.collections.gmaoAssets || {})) {
  if (a.qrToken) put(`gmaoQr/${a.qrToken}`, { tenantId: TENANT, assetId: a.id, createdAt: new Date().toISOString() });
}

console.log(`${writes.length} documents à écrire`);
for (let i = 0; i < writes.length; i += 400) {
  const res = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ writes: writes.slice(i, i + 400) }),
  });
  if (!res.ok) { console.error('ÉCHEC', res.status, await res.text()); process.exit(1); }
  console.log(`  ✓ ${Math.min(i + 400, writes.length)}/${writes.length}`);
}
const kangoo = Object.values(state.collections.gmaoAssets).find(a => a.code === 'MAT504');
console.log(`Terminé. QR du broyeur MAT504 : https://${PROJECT}.web.app/csp/q/${kangoo.qrToken}`);
