// Tests du module stock (option par organisation).
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleGmaoAction, handlePublicAction } = require('../lib/gmao/core');
const { memoryStore, emptyState } = require('../lib/gmao/memoryStore');
const { planOf } = require('../lib/gmao/model');
const { stockSnapshot, periodRecap, monthBounds } = require('../lib/gmao/stock');

const USERS = [
  { id: 'resp', name: 'Sébastien', role: 'RESPONSABLE' },
  { id: 't1', name: 'Jordan', role: 'TECHNICIEN' },
  { id: 'cli', name: 'Exploitation', role: 'CLIENT', clientId: 'c1' },
];

function setup({ stock = true } = {}) {
  const state = emptyState(JSON.parse(JSON.stringify(USERS)), planOf('PRO'), 'Test');
  if (stock) state.modules = { stock: true };
  const store = memoryStore(state);
  const actor = id => { const u = state.users.find(x => x.id === id); return { id: u.id, name: u.name, role: u.role, clientId: u.clientId || null }; };
  let clock = new Date('2026-11-10T00:00:00Z').getTime();
  const call = (who, action, payload, now) => {
    clock += 60000;
    return handleGmaoAction({ store, actor: actor(who), now: now || new Date(clock), effects: [] }, action, payload);
  };
  return { state, store, call };
}

const coll = (state, name) => Object.values(state.collections[name] || {});

async function base(s) {
  const mag = await s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'MAGASIN', name: 'Conteneur Ducos' });
  const a3 = await s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'CASIER', name: 'A3', parentId: mag.id });
  const b1 = await s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'CASIER', name: 'B1', parentId: mag.id });
  const item = await s.call('resp', 'STOCK_ITEM_SAVE', { code: 'flt-hyd-01', name: 'Filtre hydraulique', unit: 'pièce', supplierRefs: 'HF6177 | P550148', minQty: 2 });
  return { mag: mag.id, a3: a3.id, b1: b1.id, item: item.id };
}

test('module désactivé : toute action stock est refusée', async () => {
  const s = setup({ stock: false });
  await assert.rejects(s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'MAGASIN', name: 'X' }), /module stock n'est pas activé/);
});

test('référentiel : référence unique, références fournisseurs, QR par emplacement', async () => {
  const s = setup();
  const ids = await base(s);
  const it = s.state.collections.gmaoStockItems[ids.item];
  assert.equal(it.code, 'FLT-HYD-01');
  assert.deepEqual(it.supplierRefs, ['HF6177', 'P550148']);
  assert.equal(it.qty, 0);
  await assert.rejects(s.call('resp', 'STOCK_ITEM_SAVE', { code: 'FLT-HYD-01', name: 'Doublon' }), /existe déjà/);
  const locs = coll(s.state, 'gmaoStockLocations');
  assert.equal(locs.length, 3);
  assert.ok(locs.every(l => /^[A-Za-z0-9]{20}$/.test(l.qrToken)));
  await assert.rejects(s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'CASIER', name: 'a3', parentId: ids.mag }), /existe déjà/);
  await assert.rejects(s.call('resp', 'STOCK_LOCATION_SAVE', { kind: 'CASIER', name: 'Z', parentId: ids.a3 }), /dans un magasin/);
});

test('prix moyen pondéré : entrées, sortie valorisée au PMP, retour au prix de la sortie', async () => {
  const s = setup();
  const ids = await base(s);
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 4, unitCost: 1000, reference: 'FA-123' });
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 6, unitCost: 1500 });
  let it = s.state.collections.gmaoStockItems[ids.item];
  assert.equal(it.qty, 10);
  assert.equal(it.avgCost, 1300); // (4×1000 + 6×1500) / 10
  const out = await s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 3, reason: 'Atelier' });
  const sortie = s.state.collections.gmaoStockMoves[out.id];
  assert.equal(sortie.value, 3900);
  assert.equal(sortie.unitCost, 1300);
  it = s.state.collections.gmaoStockItems[ids.item];
  assert.equal(it.qty, 7);
  assert.equal(it.levels[ids.a3], 7);
  // « j'en ai pris 3, j'en rends 1 »
  await s.call('resp', 'STOCK_RETURN', { sourceMoveId: out.id, qty: 1 });
  assert.equal(s.state.collections.gmaoStockMoves[out.id].returnedQty, 1);
  await assert.rejects(s.call('resp', 'STOCK_RETURN', { sourceMoveId: out.id, qty: 3 }), /Au plus 2/);
  it = s.state.collections.gmaoStockItems[ids.item];
  assert.equal(it.qty, 8);
  assert.equal(it.avgCost, 1300);
});

test('sortie : stock insuffisant, motif ou intervention obligatoire', async () => {
  const s = setup();
  const ids = await base(s);
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 2, unitCost: 500 });
  await assert.rejects(s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 3, reason: 'x' }), /Stock insuffisant/);
  await assert.rejects(s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.b1, qty: 1, reason: 'x' }), /Stock insuffisant/);
  await assert.rejects(s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 1 }), /motif/);
});

test('droits : technicien autorisé seulement par réglage, client jamais', async () => {
  const s = setup();
  const ids = await base(s);
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 5, unitCost: 100 });
  await assert.rejects(s.call('t1', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 1, reason: 'x' }), /Seul le responsable/);
  await assert.rejects(s.call('t1', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 1, unitCost: 1 }), /réservée au responsable/);
  await assert.rejects(s.call('cli', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 1, reason: 'x' }), /non autorisée/);
  await s.call('resp', 'SETTINGS_SAVE', { stockTechniciansCanTake: true });
  await s.call('t1', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 1, reason: 'Graissage' });
  assert.equal(s.state.collections.gmaoStockItems[ids.item].qty, 4);
});

test('transfert entre casiers et ajustement d’inventaire', async () => {
  const s = setup();
  const ids = await base(s);
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 5, unitCost: 200 });
  await s.call('resp', 'STOCK_TRANSFER', { itemId: ids.item, locationId: ids.a3, toLocationId: ids.b1, qty: 2 });
  let it = s.state.collections.gmaoStockItems[ids.item];
  assert.deepEqual(it.levels, { [ids.a3]: 3, [ids.b1]: 2 });
  assert.equal(it.qty, 5);
  await assert.rejects(s.call('resp', 'STOCK_ADJUST', { itemId: ids.item, locationId: ids.b1, countedQty: 1 }), /motif/);
  const adj = await s.call('resp', 'STOCK_ADJUST', { itemId: ids.item, locationId: ids.b1, countedQty: 1, reason: 'Inventaire novembre' });
  assert.equal(adj.diff, -1);
  it = s.state.collections.gmaoStockItems[ids.item];
  assert.equal(it.qty, 4);
  assert.equal(s.state.collections.gmaoStockMoves[adj.id].value, -200);
  await assert.rejects(s.call('resp', 'STOCK_LOCATION_ARCHIVE', { id: ids.b1 }), /contient encore/);
});

test('pièces utilisées à la clôture d’une intervention (et refus si stock insuffisant)', async () => {
  const s = setup();
  const ids = await base(s);
  const site = await s.call('resp', 'SITE_SAVE', { name: 'Ducos' });
  const asset = await s.call('resp', 'ASSET_CREATE', { name: 'Chargeuse L550', siteId: site.id });
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 2, unitCost: 4000 });
  const wo = await s.call('resp', 'WO_CREATE', { assetId: asset.id, title: 'Remplacer filtre', assigneeIds: ['resp'] });
  const t = '2026-11-10T01:00:00Z';
  await assert.rejects(s.call('resp', 'WO_CLOSE', { id: wo.id, report: 'Fait', actualStart: '2026-11-09T22:00:00Z', actualEnd: '2026-11-09T23:00:00Z', parts: [{ itemId: ids.item, locationId: ids.a3, qty: 3 }] }, new Date(t)), /stock insuffisant/);
  assert.equal(s.state.collections.gmaoWorkOrders[wo.id].status, 'A_PLANIFIER');
  await s.call('resp', 'WO_CLOSE', { id: wo.id, report: 'Filtre remplacé', actualStart: '2026-11-09T22:00:00Z', actualEnd: '2026-11-09T23:00:00Z', parts: [{ itemId: ids.item, locationId: ids.a3, qty: 1 }] }, new Date(t));
  const moves = coll(s.state, 'gmaoStockMoves').filter(m => m.workOrderId === wo.id);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].assetId, asset.id);
  assert.equal(moves[0].value, 4000);
  assert.equal(s.state.collections.gmaoStockItems[ids.item].qty, 1);
  // Intervention réalisée sur place : la vérification précède la création
  const before = coll(s.state, 'gmaoWorkOrders').length;
  await assert.rejects(s.call('resp', 'WO_RECORD', { assetId: asset.id, title: 'x', report: 'x', actualStart: '2026-11-09T22:00:00Z', actualEnd: '2026-11-09T23:00:00Z', parts: [{ itemId: ids.item, locationId: ids.a3, qty: 5 }] }, new Date(t)), /stock insuffisant/);
  assert.equal(coll(s.state, 'gmaoWorkOrders').length, before);
});

test('réception pour une intervention : entrée puis sortie immédiate', async () => {
  const s = setup();
  const ids = await base(s);
  const site = await s.call('resp', 'SITE_SAVE', { name: 'Gadji' });
  const asset = await s.call('resp', 'ASSET_CREATE', { name: 'Pelle 320', siteId: site.id });
  const wo = await s.call('resp', 'WO_CREATE', { assetId: asset.id, title: 'Flexible' });
  const r = await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 1, unitCost: 25000, forWorkOrderId: wo.id });
  assert.ok(r.outNumber);
  assert.equal(s.state.collections.gmaoStockItems[ids.item].qty, 0);
  const types = coll(s.state, 'gmaoStockMoves').map(m => m.type).sort();
  assert.deepEqual(types, ['ENTREE', 'SORTIE']);
});

test('import : référentiel + stock d’ouverture, tout ou rien en cas d’erreur', async () => {
  const s = setup();
  const bad = await s.call('resp', 'STOCK_IMPORT', { rows: [
    { code: 'A1', name: 'Courroie', store: 'Conteneur Gadji', bin: 'C2', qty: 3, unitCost: 1200 },
    { code: 'A2', name: '', qty: 1, store: 'X', unitCost: 1 },
  ] });
  assert.equal(bad.errors.length, 1);
  assert.equal(coll(s.state, 'gmaoStockItems').length, 0);
  const ok = await s.call('resp', 'STOCK_IMPORT', { rows: [
    { code: 'A1', name: 'Courroie', family: 'Transmission', store: 'Conteneur Gadji', bin: 'C2', qty: 3, unitCost: '1 200' },
    { code: 'A1', name: 'Courroie', store: 'Conteneur Ducos', bin: 'A3', qty: 2, unitCost: 1200 },
    { code: 'B7', name: 'Graisse EP2', unit: 'kg', store: 'Conteneur Gadji', qty: '12,5', unitCost: 800 },
    { code: 'C9', name: 'Joint torique', qty: 0 },
  ] });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.created, 3);
  assert.equal(ok.locations, 4); // 2 magasins + 2 casiers
  assert.equal(ok.moves, 3);
  const a1 = coll(s.state, 'gmaoStockItems').find(i => i.code === 'A1');
  assert.equal(a1.qty, 5);
  assert.equal(Object.keys(a1.levels).length, 2);
  const b7 = coll(s.state, 'gmaoStockItems').find(i => i.code === 'B7');
  assert.equal(b7.qty, 12.5);
  assert.ok(coll(s.state, 'gmaoStockMoves').every(m => m.opening));
});

test('états compta : stock à date et récapitulatif mensuel équilibré', async () => {
  const s = setup();
  const ids = await base(s);
  const oct = d => new Date(`2026-10-${d}T00:00:00Z`);
  const nov = d => new Date(`2026-11-${d}T00:00:00Z`);
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 10, unitCost: 1000 }, oct('05'));
  await s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 4, reason: 'x' }, oct('20'));
  await s.call('resp', 'STOCK_IN', { itemId: ids.item, locationId: ids.a3, qty: 6, unitCost: 1500 }, nov('03'));
  await s.call('resp', 'STOCK_OUT', { itemId: ids.item, locationId: ids.a3, qty: 2, reason: 'x' }, nov('04'));
  await s.call('resp', 'STOCK_ADJUST', { itemId: ids.item, locationId: ids.a3, countedQty: 9, reason: 'Inventaire' }, nov('05'));
  const moves = coll(s.state, 'gmaoStockMoves');
  const items = coll(s.state, 'gmaoStockItems');
  const snapOct = stockSnapshot(moves, '2026-11-01T00:00:00Z').get(ids.item);
  assert.equal(snapOct.qty, 6);
  assert.equal(snapOct.avgCost, 1000);
  const { start, end } = monthBounds(2026, 11, 0);
  const [l] = periodRecap(moves, items, start, end);
  assert.equal(l.openQty, 6); assert.equal(l.openValue, 6000);
  assert.equal(l.inQty, 6); assert.equal(l.inValue, 9000);
  assert.equal(l.outQty, 2); assert.equal(l.outValue, 2500); // PMP 1250
  assert.equal(l.adjustQty, -1); assert.equal(l.adjustValue, -1250);
  assert.equal(l.closeQty, 9); assert.equal(l.closeValue, 11250);
  assert.equal(l.valuationGap, 0);
  // Nouméa : le 1er novembre à 05:00 locale tombe encore le 31 octobre en UTC
  assert.equal(monthBounds(2026, 11, 660).start, '2026-10-31T13:00:00.000Z');
});

test('QR d’un emplacement : refusé sur le formulaire public', async () => {
  const s = setup();
  const ids = await base(s);
  const token = s.state.collections.gmaoStockLocations[ids.a3].qrToken;
  await assert.rejects(handlePublicAction({ store: s.store, actor: { id: 'public', name: 'x', role: 'CLIENT' }, now: new Date(), effects: [] }, 'INFO', { token }), /emplacement de stock/);
});
