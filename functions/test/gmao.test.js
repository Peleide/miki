// Tests de la logique métier GMAO (sans Firebase).
// Lancer : cd functions && npm run build && node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleGmaoAction, runPreventiveScan } = require('../lib/gmao/core');
const { memoryStore, emptyState } = require('../lib/gmao/memoryStore');
const { seedCspDemo } = require('../lib/gmao/seed');
const { availabilityRate } = require('../lib/gmao/rules');

const USERS = [
  { id: 'resp', name: 'Alex Martin', role: 'RESPONSABLE' },
  { id: 't1', name: 'Tom Leroy', role: 'TECHNICIEN' },
  { id: 't2', name: 'Yann Kaipo', role: 'TECHNICIEN' },
  { id: 't3', name: 'Rémi Hnace', role: 'TECHNICIEN' },
  { id: 'dem', name: 'Léa Morel', role: 'DEMANDEUR' },
];
const actor = id => USERS.find(u => u.id === id);

function setup() {
  const state = emptyState(USERS);
  const store = memoryStore(state);
  const call = (who, action, payload, now = new Date()) => {
    const ctx = { store, actor: actor(who), now, effects: [] };
    return handleGmaoAction(ctx, action, payload).then(r => ({ r, effects: ctx.effects }));
  };
  return { state, store, call };
}

async function seeded() {
  const s = setup();
  await seedCspDemo(s.store, { responsable: actor('resp'), techniciens: [actor('t1'), actor('t2'), actor('t3')], demandeur: actor('dem') });
  return s;
}

const coll = (state, name) => Object.values(state.collections[name] || {});

test('le jeu de démo se construit et reste cohérent', async () => {
  const { state } = await seeded();
  const assets = coll(state, 'gmaoAssets');
  const wos = coll(state, 'gmaoWorkOrders');
  const reqs = coll(state, 'gmaoRequests');
  assert.ok(assets.length >= 20, `${assets.length} équipements`);
  assert.equal(reqs.filter(r => r.status === 'A_APPROUVER').length, 2);
  assert.ok(wos.filter(w => w.status === 'CLOTURE' && w.kind === 'PREVENTIF').length >= 10, 'historique préventif');
  assert.ok(wos.some(w => w.status === 'EN_COURS'));
  assert.ok(wos.some(w => w.status === 'EN_ATTENTE'));
  assert.ok(wos.some(w => w.status === 'PLANIFIE'));
  // chaque BT ouvert d'une gamme est référencé dans le planning de la gamme
  for (const plan of coll(state, 'gmaoPmPlans')) {
    for (const [assetId, entry] of Object.entries(plan.schedule)) {
      if (entry.openWorkOrderId) {
        const wo = state.collections.gmaoWorkOrders[entry.openWorkOrderId];
        assert.ok(wo && ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'].includes(wo.status), `BT ouvert cohérent pour ${plan.name}`);
        assert.equal(wo.assetId, assetId);
      }
    }
  }
  // les numéros sont uniques
  const nums = wos.map(w => w.number);
  assert.equal(new Set(nums).size, nums.length);
  // disponibilité calculable et entre 0 et 1
  const events = coll(state, 'gmaoAssetEvents');
  const end = Date.now(), start = end - 90 * 86400000;
  for (const a of assets.filter(a => a.level === 'EQUIPEMENT')) {
    const rate = availabilityRate(a, events, start, end);
    assert.ok(rate === null || (rate >= 0 && rate <= 1), `${a.code} ${rate}`);
  }
  const pl215 = assets.find(a => a.code === 'PL215');
  assert.equal(pl215.state, 'INDISPONIBLE');
  assert.ok(availabilityRate(pl215, events, start, end) < 0.95);
});

test('permissions : un demandeur ne peut pas approuver ni planifier', async () => {
  const { state, call } = await seeded();
  const req = coll(state, 'gmaoRequests').find(r => r.status === 'A_APPROUVER');
  await assert.rejects(call('dem', 'REQUEST_APPROVE', { id: req.id }), /non autorisée/);
  await assert.rejects(call('t1', 'REQUEST_APPROVE', { id: req.id }), /non autorisée/);
  const wo = coll(state, 'gmaoWorkOrders').find(w => w.status === 'A_PLANIFIER');
  await assert.rejects(call('t1', 'WO_PLAN', { id: wo.id, assigneeIds: ['t1'], plannedStart: new Date().toISOString(), plannedEnd: new Date(Date.now() + 3600000).toISOString() }), /non autorisée/);
});

test('parcours correctif complet : DI → BT → planification → Take 5 → clôture', async () => {
  const { state, call } = await seeded();
  const asset = coll(state, 'gmaoAssets').find(a => a.code === 'BEN032');
  const { r: created, effects } = await call('dem', 'REQUEST_CREATE', {
    assetId: asset.id, description: 'Porte arrière ne ferme plus', declaredState: 'INDISPONIBLE',
    impact: { safety: true, regulatory: false, production: 'AUCUN' },
  });
  const di = state.collections.gmaoRequests[created.id];
  assert.equal(di.priority, 'P1', 'sécurité ⇒ P1');
  assert.match(di.number, /^DI-\d{4}-\d{4}$/);
  assert.equal(state.collections.gmaoAssets[asset.id].state, 'INDISPONIBLE');
  assert.ok(effects.some(e => e.type === 'notifyManagers' && e.level === 'CRITICAL'));

  const { r: ap } = await call('resp', 'REQUEST_APPROVE', { id: di.id, priority: 'P2', interventionType: 'STRUCTURE' });
  const wo = state.collections.gmaoWorkOrders[ap.workOrderId];
  assert.equal(wo.status, 'A_PLANIFIER');
  assert.equal(wo.priority, 'P2');
  assert.equal(state.collections.gmaoRequests[di.id].status, 'APPROUVEE');

  const start = new Date(Date.now() - 3 * 3600000), end = new Date(Date.now() - 3600000);
  const { effects: planFx } = await call('resp', 'WO_PLAN', { id: wo.id, assigneeIds: ['t2'], plannedStart: start.toISOString(), plannedEnd: end.toISOString() });
  assert.equal(state.collections.gmaoWorkOrders[wo.id].status, 'PLANIFIE');
  assert.equal(state.collections.gmaoRequests[di.id].status, 'PLANIFIEE');
  assert.ok(planFx.some(e => e.type === 'notifyUser' && e.userId === 't2'));

  await assert.rejects(call('t1', 'WO_START', { id: wo.id }), /pas attribué/);
  await assert.rejects(call('t2', 'WO_START', { id: wo.id }), /obligatoire/);
  const take5 = state.collections.checklists[state.settings.safetyChecklistId];
  const answers = Object.fromEntries(take5.items.map(i => [i.id, { value: true }]));
  const refused = { ...answers, [take5.items[2].id]: { value: false } };
  await assert.rejects(call('t2', 'WO_START', { id: wo.id, safetyAnswers: refused }), /Sécurité non validée/);
  await call('t2', 'WO_START', { id: wo.id, safetyAnswers: answers }, start);
  assert.equal(state.collections.gmaoWorkOrders[wo.id].status, 'EN_COURS');

  await assert.rejects(call('t2', 'WO_CLOSE', { id: wo.id, actualStart: start.toISOString(), actualEnd: end.toISOString(), report: '  ' }), /rapport/);
  await call('t2', 'WO_CLOSE', { id: wo.id, actualStart: start.toISOString(), actualEnd: end.toISOString(), report: 'Charnière remplacée', partsCost: 15000 });
  const closed = state.collections.gmaoWorkOrders[wo.id];
  assert.equal(closed.status, 'CLOTURE');
  assert.equal(closed.laborHours, 2);
  assert.equal(state.collections.gmaoRequests[di.id].status, 'CLOTUREE');
  assert.equal(state.collections.gmaoAssets[asset.id].state, 'OPERATIONNEL');
});

test('préventif au compteur : un relevé déclenche le BT, la clôture recale l’échéance', async () => {
  const { state, call } = setup();
  const { r: site } = await call('resp', 'SITE_SAVE', { name: 'Ducos' });
  const { r: a } = await call('resp', 'ASSET_CREATE', { code: 'EN1', name: 'Chargeuse', siteId: site.id, family: 'EN', meterType: 'HEURES', meterValue: 1000 });
  const { r: pm } = await call('resp', 'PM_SAVE', { name: 'Vidange 500 h', trigger: 'COMPTEUR', intervalValue: 500, alertBefore: 20, assetIds: [a.id] });
  assert.equal(state.collections.gmaoPmPlans[pm.id].schedule[a.id].nextDueMeter, 1500);
  assert.deepEqual(pm.generatedWorkOrders, []);
  await assert.rejects(call('t1', 'METER_ADD', { id: a.id, value: 900 }), /inférieur/);
  const { r: m1 } = await call('t1', 'METER_ADD', { id: a.id, value: 1470 });
  assert.equal(m1.generatedWorkOrders.length, 0);
  const { r: m2 } = await call('t1', 'METER_ADD', { id: a.id, value: 1485 });
  assert.equal(m2.generatedWorkOrders.length, 1, 'seuil d’alerte atteint');
  const { r: m3 } = await call('t1', 'METER_ADD', { id: a.id, value: 1490 });
  assert.equal(m3.generatedWorkOrders.length, 0, 'pas de doublon tant que le BT est ouvert');
  const wo = coll(state, 'gmaoWorkOrders')[0];
  const start = new Date(Date.now() - 7200000);
  await call('resp', 'WO_CLOSE', { id: wo.id, actualStart: start.toISOString(), actualEnd: new Date(Date.now() - 3600000).toISOString(), report: 'Vidange faite', meterAtClose: 1502 });
  const entry = state.collections.gmaoPmPlans[pm.id].schedule[a.id];
  assert.equal(entry.nextDueMeter, 2002);
  assert.equal(entry.openWorkOrderId, null);
  assert.equal(state.collections.gmaoAssets[a.id].meterValue, 1502);
});

test('préventif calendaire : annuler un BT saute l’occurrence, pas de régénération immédiate', async () => {
  const { state, call } = setup();
  const { r: site } = await call('resp', 'SITE_SAVE', { name: 'Gadji' });
  const { r: a } = await call('resp', 'ASSET_CREATE', { code: 'IF1', name: 'Grue', siteId: site.id, family: 'IF' });
  const due = new Date(Date.now() + 2 * 86400000).toISOString();
  const { r: pm } = await call('resp', 'PM_SAVE', { name: 'Contrôle', trigger: 'CALENDAIRE', intervalValue: 1, intervalUnit: 'MOIS', alertBefore: 5, firstDueAt: due, assetIds: [a.id] });
  assert.equal(pm.generatedWorkOrders.length, 1);
  const wo = coll(state, 'gmaoWorkOrders')[0];
  assert.equal(wo.dueDate, due);
  await call('resp', 'WO_CANCEL', { id: wo.id, reason: 'Machine vendue' });
  const { r: scan } = await call('resp', 'PM_SCAN', {});
  assert.equal(scan.generatedWorkOrders.length, 0);
  const next = new Date(state.collections.gmaoPmPlans[pm.id].schedule[a.id].nextDueAt);
  assert.ok(next.getTime() > new Date(due).getTime() + 25 * 86400000);
});

test('arborescence : les enfants héritent du site et un composant ne peut pas avoir d’enfant', async () => {
  const { state, call } = setup();
  const { r: s1 } = await call('resp', 'SITE_SAVE', { name: 'Ducos' });
  const { r: s2 } = await call('resp', 'SITE_SAVE', { name: 'Gadji' });
  const { r: eq } = await call('resp', 'ASSET_CREATE', { code: 'MAT1', name: 'Broyeur', siteId: s1.id, family: 'IF' });
  const { r: sub } = await call('resp', 'ASSET_CREATE', { code: 'MAT1-C', name: 'Convoyeur', parentId: eq.id });
  const { r: comp } = await call('resp', 'ASSET_CREATE', { code: 'MAT1-C-R', name: 'Rouleaux', parentId: sub.id });
  assert.equal(state.collections.gmaoAssets[sub.id].level, 'SOUS_EQUIPEMENT');
  assert.equal(state.collections.gmaoAssets[comp.id].level, 'COMPOSANT');
  await assert.rejects(call('resp', 'ASSET_CREATE', { code: 'X', name: 'X', parentId: comp.id }), /composant/);
  await assert.rejects(call('resp', 'ASSET_CREATE', { code: 'mat1', name: 'Doublon', siteId: s1.id }), /existe déjà/);
  await call('resp', 'ASSET_UPDATE', { id: eq.id, updates: { siteId: s2.id } });
  assert.equal(state.collections.gmaoAssets[comp.id].siteId, s2.id);
  await assert.rejects(call('resp', 'ASSET_ARCHIVE', { id: eq.id }), /sous-équipements/);
});

test('planning : tâche assignée, le technicien la coche, pas celle d’un autre', async () => {
  const { state, call } = setup();
  const start = new Date(), end = new Date(Date.now() + 3600000);
  const { r: t, effects } = await call('resp', 'TASK_SAVE', { title: 'Graissage', kind: 'TACHE', assigneeIds: ['t1'], start: start.toISOString(), end: end.toISOString() });
  assert.ok(effects.some(e => e.type === 'notifyUser' && e.userId === 't1'));
  await assert.rejects(call('resp', 'TASK_SAVE', { title: 'X', assigneeIds: ['dem'], start: start.toISOString(), end: end.toISOString() }), /intervenant/);
  await assert.rejects(call('t2', 'TASK_TOGGLE_DONE', { id: t.id, done: true }), /pas attribuée/);
  await call('t1', 'TASK_TOGGLE_DONE', { id: t.id, done: true });
  assert.equal(state.collections.gmaoTasks[t.id].status, 'FAIT');
});
