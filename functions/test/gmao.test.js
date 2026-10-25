// Tests de la logique métier GMAO (sans Firebase).
// Lancer : cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleGmaoAction, handlePublicAction, runPreventiveScan } = require('../lib/gmao/core');
const { memoryStore, emptyState } = require('../lib/gmao/memoryStore');
const { seedDemo } = require('../lib/gmao/seed');
const { planOf } = require('../lib/gmao/model');
const { occurrences, nextOccurrence, describeRecurrence, isoOf, civilOf } = require('../lib/gmao/recurrence');
const { nextEntryAfterCompletion, initialScheduleEntry, isPmDue } = require('../lib/gmao/rules');

const OFFSET = 660;
const USERS = [
  { id: 'resp', name: 'Alex Martin', role: 'RESPONSABLE' },
  { id: 't1', name: 'Tom Leroy', role: 'TECHNICIEN' },
  { id: 't2', name: 'Yann Kaipo', role: 'TECHNICIEN' },
  { id: 'cli', name: 'Léa Morel', role: 'CLIENT', clientId: null },
];

function setup(plan = planOf('PRO'), users = USERS) {
  const state = emptyState(JSON.parse(JSON.stringify(users)), plan, 'Test');
  const store = memoryStore(state);
  const actor = id => { const u = state.users.find(x => x.id === id); return { id: u.id, name: u.name, role: u.role, clientId: u.clientId || null }; };
  const call = (who, action, payload, now = new Date()) => {
    const ctx = { store, actor: actor(who), now, effects: [] };
    return handleGmaoAction(ctx, action, payload).then(r => ({ r, effects: ctx.effects }));
  };
  const pub = (action, payload, now = new Date()) => handlePublicAction({ store, actor: { id: 'public', name: 'x', role: 'CLIENT' }, now, effects: [] }, action, payload);
  return { state, store, call, pub };
}

async function seeded() {
  const s = setup();
  await seedDemo(s.store, { responsable: s.state.users[0], techniciens: [s.state.users[1], s.state.users[2]], client: s.state.users[3] }, new Date(), cid => { s.state.users[3].clientId = cid; });
  return s;
}

const coll = (state, name) => Object.values(state.collections[name] || {});
const OPEN = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'];

// ─── Récurrences ─────────────────────────────────────────────────────────────

const take = (rule, start, n) => { const out = []; for (const o of occurrences(rule, start)) { out.push(o.date); if (out.length >= n) break; } return out; };

test('récurrence hebdomadaire : lundi et jeudi, toutes les 2 semaines', () => {
  const rule = { freq: 'WEEKLY', interval: 2, byWeekday: [0, 3], end: { type: 'NEVER' }, anchor: 'CALENDRIER' };
  assert.deepEqual(take(rule, '2026-10-26', 4), ['2026-10-26', '2026-10-29', '2026-11-09', '2026-11-12']);
  assert.match(describeRecurrence(rule, '2026-10-26'), /Toutes les 2 semaines le lundi et jeudi/);
});

test('récurrence mensuelle : 2e mardi, dernier vendredi, 31 du mois', () => {
  const nth = { freq: 'MONTHLY', interval: 1, monthlyMode: 'NTH_WEEKDAY', end: { type: 'NEVER' }, anchor: 'CALENDRIER' };
  assert.deepEqual(take(nth, '2026-10-13', 3), ['2026-10-13', '2026-11-10', '2026-12-08']);
  assert.match(describeRecurrence(nth, '2026-10-13'), /le 2e mardi/);
  assert.deepEqual(take(nth, '2026-10-30', 3), ['2026-10-30', '2026-11-27', '2026-12-25'], 'dernier vendredi du mois');
  const day = { freq: 'MONTHLY', interval: 1, monthlyMode: 'DAY', end: { type: 'NEVER' }, anchor: 'CALENDRIER' };
  assert.deepEqual(take(day, '2027-01-31', 3), ['2027-01-31', '2027-02-28', '2027-03-31']);
  const quarter = { ...day, interval: 3 };
  assert.deepEqual(take(quarter, '2026-11-15', 3), ['2026-11-15', '2027-02-15', '2027-05-15']);
});

test('récurrence : fin après N fois ou à une date', () => {
  const count = { freq: 'DAILY', interval: 1, end: { type: 'COUNT', count: 3 }, anchor: 'CALENDRIER' };
  assert.deepEqual(take(count, '2026-10-01', 10), ['2026-10-01', '2026-10-02', '2026-10-03']);
  const until = { freq: 'YEARLY', interval: 1, end: { type: 'UNTIL', until: '2028-06-01' }, anchor: 'CALENDRIER' };
  assert.deepEqual(take(until, '2026-03-12', 10), ['2026-03-12', '2027-03-12', '2028-03-12']);
  assert.match(describeRecurrence(count, '2026-10-01'), /3 fois/);
});

test('préventif mensuel : une échéance manquée n’est pas rattrapée et ne crée pas de doublon', () => {
  const plan = { trigger: 'CALENDAIRE', recurrence: { freq: 'MONTHLY', interval: 1, monthlyMode: 'DAY', end: { type: 'NEVER' }, anchor: 'CALENDRIER' }, alertBefore: 0 };
  const entry = initialScheduleEntry(plan, undefined, new Date(isoOf('2026-06-01', OFFSET)), OFFSET, '2026-06-01');
  assert.equal(civilOf(entry.nextDueAt, OFFSET), '2026-06-01');
  // juin non fait, réalisé le 15 juillet → la suivante est août, pas juillet
  const after = nextEntryAfterCompletion(plan, entry, isoOf('2026-07-15', OFFSET, 10), null, OFFSET);
  assert.equal(civilOf(after.nextDueAt, OFFSET), '2026-08-01');
  // fait en avance (28 juin pour l'échéance du 1er juillet) → la suivante reste août
  const july = { ...entry, nextDueAt: isoOf('2026-07-01', OFFSET) };
  assert.equal(civilOf(nextEntryAfterCompletion(plan, july, isoOf('2026-06-28', OFFSET, 10), null, OFFSET).nextDueAt, OFFSET), '2026-08-01');
  // ancrage « depuis la réalisation » : +1 mois après la date réelle
  const real = { ...plan, recurrence: { ...plan.recurrence, anchor: 'REALISATION' } };
  assert.equal(civilOf(nextEntryAfterCompletion(real, entry, isoOf('2026-07-15', OFFSET, 10), null, OFFSET).nextDueAt, OFFSET), '2026-08-15');
  // une intervention ouverte bloque toute nouvelle génération
  assert.equal(isPmDue(plan, { ...entry, openWorkOrderId: 'x' }, undefined, new Date(isoOf('2026-09-01', OFFSET))), false);
});

test('préventif au compteur : depuis la réalisation ou à intervalles fixes', () => {
  const real = { trigger: 'COMPTEUR', meterInterval: 10000, meterAnchor: 'REALISATION', alertBefore: 1000 };
  const fixed = { ...real, meterAnchor: 'FIXE' };
  const entry = { startMeter: 50000, nextDueMeter: 50000 };
  assert.equal(nextEntryAfterCompletion(real, entry, new Date().toISOString(), 51200, OFFSET).nextDueMeter, 61200);
  assert.equal(nextEntryAfterCompletion(fixed, entry, new Date().toISOString(), 51200, OFFSET).nextDueMeter, 60000);
  assert.equal(nextEntryAfterCompletion(fixed, entry, new Date().toISOString(), 62500, OFFSET).nextDueMeter, 70000, 'vidange très en retard : pas de rattrapage');
});

// ─── Démo ────────────────────────────────────────────────────────────────────

test('le jeu de démo se construit et reste cohérent', async () => {
  const { state } = await seeded();
  const assets = coll(state, 'gmaoAssets');
  const wos = coll(state, 'gmaoWorkOrders');
  const reqs = coll(state, 'gmaoRequests');
  assert.ok(assets.length >= 14, `${assets.length} machines`);
  assert.ok(assets.every(a => /^MAC-\d{4}$/.test(a.code)), 'codes générés');
  assert.ok(assets.every(a => a.qrToken && a.qrToken.length >= 16), 'jeton QR');
  assert.ok(wos.filter(w => w.status === 'CLOTURE' && w.kind === 'PREVENTIF').length >= 15, 'historique préventif');
  assert.ok(reqs.some(r => r.source === 'QR_PUBLIC' && r.status === 'A_TRAITER'), 'signalement public à traiter');
  assert.ok(reqs.some(r => r.falseReport), 'faux signalement classé');
  assert.ok(reqs.some(r => r.kind === 'REMARQUE' && r.status === 'A_TRAITER'), 'remarque client');
  // une seule intervention ouverte par gamme × machine
  const seen = new Set();
  for (const w of wos.filter(w => w.pmPlanId && OPEN.includes(w.status))) {
    const k = `${w.pmPlanId}:${w.assetId}`;
    assert.ok(!seen.has(k), `doublon ${w.title} ${w.assetCode}`);
    seen.add(k);
  }
  for (const plan of coll(state, 'gmaoPmPlans')) {
    for (const [assetId, entry] of Object.entries(plan.schedule)) {
      if (entry.openWorkOrderId) {
        const wo = state.collections.gmaoWorkOrders[entry.openWorkOrderId];
        assert.ok(wo && OPEN.includes(wo.status), `intervention ouverte cohérente pour ${plan.name}`);
        assert.equal(wo.assetId, assetId);
      }
    }
  }
  // le contrôle mensuel du Duster est en retard depuis plus d'un mois, avec une seule intervention
  const duster = assets.find(a => a.name === 'Dacia Duster');
  const dusterCtrl = wos.filter(w => w.assetId === duster.id && w.title === 'Contrôle mensuel' && OPEN.includes(w.status));
  assert.equal(dusterCtrl.length, 1);
  assert.ok(new Date(dusterCtrl[0].dueDate).getTime() < Date.now() - 25 * 86400000);
  // dénormalisation pour les clients
  assert.ok(assets.filter(a => a.clientId).every(a => a.nextPm), 'prochaine échéance des machines client');
  assert.ok(wos.filter(w => w.clientId).length > 0);
  const nums = wos.map(w => w.number);
  assert.equal(new Set(nums).size, nums.length);
});

// ─── Permissions et périmètres ───────────────────────────────────────────────

test('périmètre : un technicien n’agit que sur son parc, un client que sur ses machines', async () => {
  const { state, call } = await seeded();
  const assets = coll(state, 'gmaoAssets');
  const yaris = assets.find(a => a.name === 'Toyota Yaris'); // parc de Tom (t1)
  await assert.rejects(call('t2', 'METER_ADD', { id: yaris.id, value: (yaris.meterValue || 0) + 10 }), /votre parc/);
  await call('t1', 'METER_ADD', { id: yaris.id, value: (yaris.meterValue || 0) + 10 });
  const shared = assets.find(a => a.name === 'Autolaveuse Kärcher BD 50'); // tous les techniciens
  await call('t2', 'ASSET_SET_STATE', { id: shared.id, state: 'DEGRADE', reason: 'Test' });
  await call('t1', 'ASSET_SET_STATE', { id: shared.id, state: 'OPERATIONNEL' });
  await assert.rejects(call('cli', 'REQUEST_CREATE', { assetId: yaris.id, description: 'Pas à moi' }), /votre parc/);
  const { r } = await call('cli', 'REQUEST_CREATE', { assetId: shared.id, kind: 'REMARQUE', description: 'Bruit inhabituel' });
  assert.ok(r.number.startsWith('SIG-'));
  await assert.rejects(call('cli', 'WO_CREATE', { assetId: shared.id, title: 'x' }), /non autorisée/);
  await assert.rejects(call('t1', 'ASSET_CREATE', { name: 'x', siteId: 'y' }), /non autorisée/);
});

test('validation des signalements et planning en libre-service selon les réglages', async () => {
  const { state, call } = await seeded();
  const al1 = coll(state, 'gmaoAssets').find(a => a.name === 'Autolaveuse Kärcher B 40'); // parc de Yann (t2)
  // par défaut : pas de validation, l'intervention est créée et attribuée au technicien du parc
  const { r: direct } = await call('cli', 'REQUEST_CREATE', { assetId: coll(state, 'gmaoAssets').find(a => a.name === 'Centrale buanderie').id, description: 'Voyant rouge allumé', declaredState: 'DEGRADE' });
  const wo = state.collections.gmaoWorkOrders[direct.workOrderId];
  assert.ok(wo, 'intervention créée directement');
  assert.deepEqual(wo.assigneeIds, ['t1'], 'unique technicien du périmètre');
  assert.equal(wo.priority, 'P2');
  // avec validation : le signalement attend le responsable
  await call('resp', 'SETTINGS_SAVE', { requireApproval: true });
  const { r: pending } = await call('t2', 'REQUEST_CREATE', { assetId: al1.id, description: 'Brosse usée' });
  assert.equal(pending.workOrderId, null);
  await assert.rejects(call('t2', 'REQUEST_APPROVE', { id: pending.id }), /responsable/);
  await call('resp', 'REQUEST_APPROVE', { id: pending.id });
  // planning : réservé au responsable, sauf option
  const toPlan = coll(state, 'gmaoWorkOrders').find(w => w.status === 'A_PLANIFIER' && w.assigneeIds.includes('t2'));
  const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
  await assert.rejects(call('t2', 'WO_PLAN', { id: toPlan.id, plannedStart: start, plannedEnd: end }), /responsable/);
  await call('resp', 'SETTINGS_SAVE', { techniciansSelfPlan: true });
  await call('t2', 'WO_PLAN', { id: toPlan.id, plannedStart: start, plannedEnd: end, assigneeIds: ['t1'] });
  assert.deepEqual(state.collections.gmaoWorkOrders[toPlan.id].assigneeIds, ['t2'], 'un technicien ne planifie que pour lui');
  await call('t2', 'TASK_SAVE', { title: 'Rangement local', start, end, assigneeIds: ['t1'] });
  assert.ok(coll(state, 'gmaoTasks').some(t => t.title === 'Rangement local' && t.assigneeIds.join() === 't2'));
});

test('technicien : intervention réalisée sur place en une étape (scan → saisie)', async () => {
  const { state, call } = await seeded();
  const kangoo = coll(state, 'gmaoAssets').find(a => a.name === 'Renault Kangoo');
  const end = new Date(Date.now() - 600000), start = new Date(Date.now() - 3600000);
  const { r } = await call('t1', 'WO_RECORD', { assetId: kangoo.id, title: 'Ampoule feu stop', report: 'Ampoule remplacée', actualStart: start.toISOString(), actualEnd: end.toISOString(), meterAtClose: (kangoo.meterValue || 0) + 30 });
  const wo = state.collections.gmaoWorkOrders[r.id];
  assert.equal(wo.status, 'CLOTURE');
  assert.deepEqual(wo.assigneeIds, ['t1']);
  assert.equal(state.collections.gmaoAssets[kangoo.id].meterValue, (kangoo.meterValue || 0) + 30);
  assert.ok(state.collections.gmaoAssets[kangoo.id].lastMaintenanceAt);
});

// ─── Offres et quotas ────────────────────────────────────────────────────────

test('quotas : Starter limité à 20 machines actives et 1 client', async () => {
  const { state, call } = setup(planOf('STARTER'), [USERS[0], USERS[1]]);
  const site = (await call('resp', 'SITE_SAVE', { name: 'Dépôt' })).r.id;
  for (let i = 0; i < 20; i++) await call('resp', 'ASSET_CREATE', { name: `Machine ${i + 1}`, siteId: site });
  await assert.rejects(call('resp', 'ASSET_CREATE', { name: 'Machine 21', siteId: site }), /limitée à 20 machines/);
  const first = coll(state, 'gmaoAssets')[0];
  await call('resp', 'ASSET_ARCHIVE', { id: first.id });
  await call('resp', 'ASSET_CREATE', { name: 'Machine 21', siteId: site });
  await assert.rejects(call('resp', 'ASSET_RESTORE', { id: first.id }), /limitée à 20/);
  await call('resp', 'CLIENT_SAVE', { name: 'Client A' });
  await assert.rejects(call('resp', 'CLIENT_SAVE', { name: 'Client B' }), /limitée à 1 client/);
  // import groupé : refusé en bloc s'il dépasse
  await assert.rejects(call('resp', 'ASSET_IMPORT', { rows: [{ name: 'X', site: 'Dépôt' }] }), /limitée à 20/);
  // codes générés à la suite
  assert.equal(coll(state, 'gmaoAssets').find(a => a.name === 'Machine 1').code, 'MAC-0001');
});

test('codes machine : propres à l’entreprise (import CSV) ou générés', async () => {
  const { state, call } = setup();
  await call('resp', 'SETTINGS_SAVE', { assetCodeMode: 'MANUAL' });
  const site = (await call('resp', 'SITE_SAVE', { name: 'Atelier' })).r.id;
  await assert.rejects(call('resp', 'ASSET_CREATE', { name: 'Sans code', siteId: site }), /obligatoire/);
  const { r } = await call('resp', 'ASSET_IMPORT', { rows: [
    { code: 'AL-01', name: 'Autolaveuse 1', typology: 'Autolaveuse', site: 'Atelier' },
    { code: 'AL-02', name: 'Autolaveuse 2', typology: 'Autolaveuse', site: 'Nouveau site' },
  ] });
  assert.equal(r.created, 2);
  assert.ok(coll(state, 'sites').some(s => s.name === 'Nouveau site'));
  const { r: dup } = await call('resp', 'ASSET_IMPORT', { rows: [{ code: 'al-01', name: 'Doublon', site: 'Atelier' }] });
  assert.equal(dup.created, 0);
  assert.match(dup.errors[0], /existe déjà/);
  await call('resp', 'SETTINGS_SAVE', { assetCodeMode: 'GENERATED', assetCodePrefix: 'wdp' });
  const { r: gen } = await call('resp', 'ASSET_CREATE', { name: 'Généré', siteId: site });
  assert.equal(gen.code, 'WDP-0001');
});

test('kits : idempotents, et les gammes types s’appliquent aux nouvelles machines', async () => {
  const { state, call } = setup();
  await call('resp', 'KIT_APPLY', { kitId: 'NETTOYAGE' });
  const before = coll(state, 'gmaoPmPlans').length;
  await call('resp', 'KIT_APPLY', { kitId: 'NETTOYAGE' });
  assert.equal(coll(state, 'gmaoPmPlans').length, before);
  const site = (await call('resp', 'SITE_SAVE', { name: 'Dépôt' })).r.id;
  const typ = coll(state, 'gmaoTypologies').find(t => t.name === 'Autolaveuse');
  const { r } = await call('resp', 'ASSET_CREATE', { name: 'Autolaveuse test', siteId: site, typologyId: typ.id });
  assert.deepEqual(r.attachedPlans, ['Inversion / remplacement des bavettes']);
  const plan = coll(state, 'gmaoPmPlans').find(p => p.typologyId === typ.id);
  assert.ok(plan.schedule[r.id].nextDueAt);
  assert.ok(state.collections.gmaoAssets[r.id].nextPm);
  const chk = coll(state, 'checklists').find(c => c.name === 'Entretien autolaveuse');
  assert.ok(chk.items.some(i => i.type === 'CHOICE' && i.options.includes('Inversées')));
});

// ─── Formulaire public ───────────────────────────────────────────────────────

test('QR code public : informations, signalement et garde-fous anti-spam', async () => {
  const { state, pub } = await seeded();
  const mb1 = coll(state, 'gmaoAssets').find(a => a.name === 'Monobrosse Taski Ergodisc');
  const info = await pub('INFO', { token: mb1.qrToken });
  assert.equal(info.asset.code, mb1.code);
  assert.equal(info.enabled, true);
  assert.equal(info.asset.client, null);
  await assert.rejects(pub('INFO', { token: 'inconnu-123456' }), /aucune machine/);
  const ok = { token: mb1.qrToken, name: 'Paul', description: 'La machine fait un bruit de ferraille', elapsedMs: 8000 };
  await assert.rejects(pub('REPORT', { ...ok, website: 'http://spam' }), /refusé/);
  await assert.rejects(pub('REPORT', { ...ok, elapsedMs: 300 }), /prendre le temps/);
  await assert.rejects(pub('REPORT', { ...ok, name: '' }), /nom/);
  await assert.rejects(pub('REPORT', { ...ok, description: 'nul' }), /8 caractères/);
  await assert.rejects(pub('REPORT', { ...ok, description: 'Visitez http://promo.example' }), /liens/);
  const r1 = await pub('REPORT', ok);
  assert.match(r1.number, /^SIG-/);
  const created = coll(state, 'gmaoRequests').find(r => r.number === r1.number);
  assert.equal(created.source, 'QR_PUBLIC');
  assert.equal(created.requesterId, null);
  assert.equal(state.collections.gmaoAssets[mb1.id].state, mb1.state, 'un anonyme ne change pas l’état de la machine');
  const again = await pub('REPORT', { ...ok, description: 'La machine fait un bruit de  ferraille' });
  assert.equal(again.duplicate, true);
  for (let i = 0; i < 4; i++) await pub('REPORT', { ...ok, description: `Autre problème numéro ${i}` });
  await assert.rejects(pub('REPORT', { ...ok, description: 'Encore un autre problème' }), /plusieurs fois/);
});

test('scan quotidien : rien n’est créé deux fois', async () => {
  const { state, store } = await seeded();
  const before = coll(state, 'gmaoWorkOrders').length;
  const ctx = { store, actor: { id: 'system', name: 'Système', role: 'RESPONSABLE' }, now: new Date(), effects: [] };
  await runPreventiveScan(ctx);
  await runPreventiveScan({ ...ctx, effects: [] });
  assert.equal(coll(state, 'gmaoWorkOrders').length, before);
});
