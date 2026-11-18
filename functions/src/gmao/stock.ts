// Module stock (option par organisation) : articles, magasins et casiers, mouvements valorisés au prix moyen pondéré.
// Les quantités vivent sur l'article (par emplacement) ; les mouvements forment le journal, jamais modifié.
import {
  Asset, COLL, GmaoSettings, StockItem, StockLocation, StockMove, StockMoveType, WorkOrder, withDefaults,
} from './model';
import { inPerimeter } from './rules';
import type { Ctx } from './core';
import { GmaoError, randomToken } from './core';

const fail = (code: GmaoError['code'], msg: string): never => { throw new GmaoError(code, msg); };
const clean = (o: any) => JSON.parse(JSON.stringify(o));
const text = (v: any, field: string, required = true, max = 200): string => {
  const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
  if (required && !s) fail('invalid-argument', `Champ obligatoire manquant : ${field}.`);
  if (s.length > max) fail('invalid-argument', `${field} : texte trop long (${max} caractères maximum).`);
  return s;
};
const toNum = (v: any): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(typeof v === 'string' ? v.replace(/\s/g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
};
/** Quantités : 3 décimales (litres, mètres). */
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;
/** Prix moyen : 2 décimales ; valeurs : XPF entiers. */
export const roundCost = (n: number) => Math.round(n * 100) / 100;
const xpf = (n: number) => Math.round(n);
const keyOf = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const qtyField = (v: any, field = 'quantité'): number => {
  const n = toNum(v);
  if (n == null || n <= 0) fail('invalid-argument', `${field} : indiquez une quantité supérieure à zéro.`);
  return roundQty(n as number);
};

export const STOCK_ACTIONS = [
  'STOCK_LOCATION_SAVE', 'STOCK_LOCATION_ARCHIVE', 'STOCK_ITEM_SAVE', 'STOCK_ITEM_ARCHIVE',
  'STOCK_IN', 'STOCK_OUT', 'STOCK_RETURN', 'STOCK_TRANSFER', 'STOCK_ADJUST', 'STOCK_IMPORT',
];
/** Actions réservées au responsable ; sortie et retour : aussi les techniciens si le réglage l'autorise. */
const TECH_ALLOWED = ['STOCK_OUT', 'STOCK_RETURN'];

async function settingsOf(ctx: Ctx): Promise<GmaoSettings> {
  ctx.memo = ctx.memo || {};
  if (!ctx.memo.settings) ctx.memo.settings = withDefaults(await ctx.store.getSettings());
  return ctx.memo.settings;
}

export async function stockEnabled(ctx: Ctx): Promise<boolean> {
  ctx.memo = ctx.memo || {};
  if (ctx.memo.stockEnabled === undefined) ctx.memo.stockEnabled = !!(await ctx.store.getTenantInfo()).modules?.stock;
  return ctx.memo.stockEnabled;
}

async function requireStock(ctx: Ctx) {
  if (!(await stockEnabled(ctx))) fail('failed-precondition', "Le module stock n'est pas activé pour cette organisation.");
}

async function requireTaker(ctx: Ctx) {
  if (ctx.actor.role === 'RESPONSABLE') return;
  if (ctx.actor.role === 'TECHNICIEN' && (await settingsOf(ctx)).stockTechniciansCanTake) return;
  fail('permission-denied', 'Seul le responsable peut sortir des pièces du stock.');
}

async function moveNumber(ctx: Ctx) {
  const year = ctx.now.getFullYear();
  const n = await ctx.store.nextNumber(`MVT-${year}`);
  return `MVT-${year}-${String(n).padStart(4, '0')}`;
}

async function getItem(ctx: Ctx, id: any): Promise<StockItem> {
  const it = await ctx.store.get<StockItem>(COLL.stockItems, String(id || ''));
  if (!it) fail('not-found', 'Article introuvable.');
  return it as StockItem;
}

async function getLocation(ctx: Ctx, id: any): Promise<StockLocation> {
  const loc = await ctx.store.get<StockLocation>(COLL.stockLocations, String(id || ''));
  if (!loc || loc.isArchived) fail('not-found', 'Emplacement introuvable.');
  return loc as StockLocation;
}

/** « Conteneur Ducos › A3 » */
export function locationLabel(loc: StockLocation | undefined | null, all: StockLocation[]): string {
  if (!loc) return '—';
  if (loc.kind === 'CASIER' && loc.parentId) {
    const parent = all.find(l => l.id === loc.parentId);
    return parent ? `${parent.name} › ${loc.name}` : loc.name;
  }
  return loc.name;
}

async function labelOf(ctx: Ctx, loc: StockLocation) {
  if (loc.kind !== 'CASIER' || !loc.parentId) return loc.name;
  const parent = await ctx.store.get<StockLocation>(COLL.stockLocations, loc.parentId);
  return locationLabel(loc, parent ? [parent] : []);
}

function effectiveDate(ctx: Ctx, at: any): string {
  if (!at) return ctx.now.toISOString();
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) fail('invalid-argument', 'Date invalide.');
  if (d.getTime() > ctx.now.getTime() + 5 * 60000) fail('invalid-argument', 'La date du mouvement ne peut pas être dans le futur.');
  return d.toISOString();
}

interface Applied { item: StockItem; move: StockMove }

/**
 * Enregistre un mouvement et met à jour l'article (quantités par emplacement, quantité totale, PMP).
 * Toutes les vérifications métier sont faites avant l'appel.
 */
async function record(ctx: Ctx, item: StockItem, m: {
  type: StockMoveType; qty: number; location: StockLocation; toLocation?: StockLocation | null;
  levelDelta: number; unitCost: number; at?: string; reference?: string | null; reason?: string | null;
  wo?: WorkOrder | null; asset?: Asset | null; sourceMoveId?: string | null; opening?: boolean;
}): Promise<Applied> {
  const levels = { ...(item.levels || {}) };
  const add = (locId: string, d: number) => {
    const v = roundQty((levels[locId] || 0) + d);
    if (Math.abs(v) < 1e-9) delete levels[locId]; else levels[locId] = v;
  };
  const before = item.qty || 0;
  let delta = 0;
  let avg = item.avgCost || 0;
  if (m.type === 'TRANSFERT') {
    add(m.location.id, -m.qty);
    add(m.toLocation!.id, m.qty);
  } else {
    add(m.location.id, m.levelDelta);
    delta = m.levelDelta;
    if (m.type === 'ENTREE' || m.type === 'RETOUR') {
      avg = before > 0 ? roundCost((before * avg + m.qty * m.unitCost) / (before + m.qty)) : roundCost(m.unitCost);
    }
  }
  const after = roundQty(before + delta);
  const value = m.type === 'AJUSTEMENT' ? xpf(m.levelDelta * m.unitCost) : xpf(m.qty * m.unitCost);
  const nowIso = ctx.now.toISOString();
  const id = ctx.store.newId(COLL.stockMoves);
  const move: StockMove = {
    id, number: await moveNumber(ctx), type: m.type,
    itemId: item.id, itemCode: item.code, itemName: item.name, unit: item.unit,
    qty: m.qty, delta, locationId: m.location.id, locationName: await labelOf(ctx, m.location),
    toLocationId: m.toLocation?.id || null, toLocationName: m.toLocation ? await labelOf(ctx, m.toLocation) : null,
    unitCost: roundCost(m.unitCost), value, avgCostAfter: avg, qtyAfter: after,
    at: m.at || nowIso, createdAt: nowIso, byId: ctx.actor.id, byName: ctx.actor.name,
    reference: m.reference || null, reason: m.reason || null,
    workOrderId: m.wo?.id || null, workOrderNumber: m.wo?.number || null,
    assetId: m.asset?.id || m.wo?.assetId || null, assetCode: m.asset?.code || m.wo?.assetCode || null,
    sourceMoveId: m.sourceMoveId || null,
    ...(m.type === 'SORTIE' ? { returnedQty: 0 } : {}),
    ...(m.opening ? { opening: true } : {}),
  };
  await ctx.store.set(COLL.stockMoves, id, clean(move));
  const updated: StockItem = { ...item, levels, qty: after, avgCost: avg, updatedAt: nowIso };
  await ctx.store.update(COLL.stockItems, item.id, clean({ levels, qty: after, avgCost: avg, updatedAt: nowIso }));
  return { item: updated, move };
}

async function workOrderFor(ctx: Ctx, id: any): Promise<WorkOrder | null> {
  if (!id) return null;
  const wo = await ctx.store.get<WorkOrder>(COLL.workOrders, String(id));
  if (!wo) fail('not-found', 'Intervention introuvable.');
  if (wo!.status === 'ANNULE') fail('failed-precondition', 'Cette intervention est annulée.');
  if (ctx.actor.role === 'TECHNICIEN') {
    const asset = await ctx.store.get<Asset>(COLL.assets, wo!.assetId);
    const allowed = wo!.assigneeIds.includes(ctx.actor.id) || (!wo!.assigneeIds.length && asset && inPerimeter(asset, ctx.actor.id));
    if (!allowed) fail('permission-denied', "Cette intervention ne vous est pas attribuée.");
  }
  return wo;
}

// ─── Pièces utilisées lors d'une intervention ───────────────────────────────

export interface PartLine { itemId: string; locationId: string; qty: number }

/** Vérifie les pièces déclarées à la clôture (avant toute écriture). */
export async function validateParts(ctx: Ctx, raw: any): Promise<PartLine[]> {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return [];
  await requireStock(ctx);
  await requireTaker(ctx);
  if (list.length > 40) fail('invalid-argument', 'Trop de lignes de pièces (40 maximum).');
  const parts: PartLine[] = list.map((l: any) => ({ itemId: String(l?.itemId || ''), locationId: String(l?.locationId || ''), qty: qtyField(l?.qty) }));
  const need = new Map<string, number>();
  for (const l of parts) need.set(`${l.itemId}|${l.locationId}`, roundQty((need.get(`${l.itemId}|${l.locationId}`) || 0) + l.qty));
  for (const [k, q] of need) {
    const [itemId, locationId] = k.split('|');
    const item = await getItem(ctx, itemId);
    await getLocation(ctx, locationId);
    const available = item.levels?.[locationId] || 0;
    if (q > available + 1e-9) fail('failed-precondition', `${item.code} : stock insuffisant à cet emplacement (${available} ${item.unit} disponible(s)).`);
  }
  return parts;
}

/** Sorties de stock liées à une intervention clôturée. */
export async function consumeParts(ctx: Ctx, parts: PartLine[], wo: WorkOrder) {
  for (const l of parts) {
    const item = await getItem(ctx, l.itemId);
    const location = await getLocation(ctx, l.locationId);
    await record(ctx, item, { type: 'SORTIE', qty: l.qty, location, levelDelta: -l.qty, unitCost: item.avgCost || 0, wo, reason: `Pièce posée — ${wo.number}` });
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function handleStockAction(ctx: Ctx, action: string, p: any): Promise<any> {
  if (!STOCK_ACTIONS.includes(action)) fail('invalid-argument', `Action inconnue : ${action}`);
  const { store, actor } = ctx;
  if (actor.role === 'CLIENT') fail('permission-denied', 'Action non autorisée pour votre profil.');
  if (actor.role !== 'RESPONSABLE' && !TECH_ALLOWED.includes(action)) fail('permission-denied', 'Action réservée au responsable maintenance.');
  await requireStock(ctx);
  if (TECH_ALLOWED.includes(action)) await requireTaker(ctx);
  p = p || {};
  const nowIso = ctx.now.toISOString();

  switch (action) {
    case 'STOCK_LOCATION_SAVE': {
      const kind = p.kind === 'CASIER' ? 'CASIER' : 'MAGASIN';
      const name = text(p.name, kind === 'CASIER' ? 'nom du casier' : 'nom du magasin', true, 80);
      let parentId: string | null = null;
      if (kind === 'CASIER') {
        const parent = await getLocation(ctx, p.parentId);
        if (parent.kind !== 'MAGASIN') fail('invalid-argument', 'Un casier se range dans un magasin.');
        parentId = parent.id;
      }
      const all = await store.list<StockLocation>(COLL.stockLocations);
      if (all.some(l => !l.isArchived && l.id !== p.id && l.kind === kind && (l.parentId || null) === parentId && keyOf(l.name) === keyOf(name))) {
        fail('invalid-argument', kind === 'CASIER' ? 'Ce casier existe déjà dans ce magasin.' : 'Ce magasin existe déjà.');
      }
      if (p.id) {
        const loc = await getLocation(ctx, p.id);
        await store.update(COLL.stockLocations, loc.id, clean({ name, siteId: kind === 'MAGASIN' ? (p.siteId || null) : (loc.siteId || null) }));
        return { id: loc.id };
      }
      const id = store.newId(COLL.stockLocations);
      const loc: StockLocation = { id, kind, name, parentId, siteId: kind === 'MAGASIN' ? (p.siteId || null) : null, qrToken: randomToken(), createdAt: nowIso };
      await store.set(COLL.stockLocations, id, clean(loc));
      await store.registerQr(loc.qrToken, id, 'STOCK');
      return { id };
    }
    case 'STOCK_LOCATION_ARCHIVE': {
      const loc = await getLocation(ctx, p.id);
      const items = await store.list<StockItem>(COLL.stockItems);
      if (items.some(i => (i.levels?.[loc.id] || 0) !== 0)) fail('failed-precondition', 'Cet emplacement contient encore des pièces : transférez-les avant de l’archiver.');
      if (loc.kind === 'MAGASIN' && (await store.list<StockLocation>(COLL.stockLocations)).some(l => l.parentId === loc.id && !l.isArchived)) {
        fail('failed-precondition', 'Archivez d’abord les casiers de ce magasin.');
      }
      await store.update(COLL.stockLocations, loc.id, { isArchived: true });
      return { success: true };
    }

    case 'STOCK_ITEM_SAVE': {
      const code = text(p.code, 'référence interne', true, 40).toUpperCase();
      const name = text(p.name, 'désignation', true, 160);
      const items = await store.list<StockItem>(COLL.stockItems);
      if (items.some(i => !i.isArchived && i.id !== p.id && i.code.toUpperCase() === code)) fail('invalid-argument', `La référence ${code} existe déjà.`);
      const minQty = toNum(p.minQty);
      if (minQty != null && minQty < 0) fail('invalid-argument', 'Seuil invalide.');
      const supplierRefs = (Array.isArray(p.supplierRefs) ? p.supplierRefs : String(p.supplierRefs || '').split(/[|,;\n]/))
        .map((x: any) => String(x).trim()).filter(Boolean).slice(0, 20);
      const data = {
        code, name, family: text(p.family, 'famille', false, 80) || null, unit: text(p.unit, 'unité', false, 20) || 'pièce',
        supplierRefs: Array.from(new Set(supplierRefs)), minQty: minQty == null ? null : roundQty(minQty),
        notes: text(p.notes, 'notes', false, 1000) || null, updatedAt: nowIso,
      };
      if (p.id) {
        const it = await getItem(ctx, p.id);
        await store.update(COLL.stockItems, it.id, clean(data));
        return { id: it.id };
      }
      const id = store.newId(COLL.stockItems);
      await store.set(COLL.stockItems, id, clean({ id, ...data, qty: 0, levels: {}, avgCost: 0, createdAt: nowIso }));
      return { id };
    }
    case 'STOCK_ITEM_ARCHIVE': {
      const it = await getItem(ctx, p.id);
      if (p.restore) { await store.update(COLL.stockItems, it.id, { isArchived: false, updatedAt: nowIso }); return { success: true }; }
      if (Math.abs(it.qty || 0) > 1e-9) fail('failed-precondition', 'Le stock de cet article n’est pas à zéro.');
      await store.update(COLL.stockItems, it.id, { isArchived: true, updatedAt: nowIso });
      return { success: true };
    }

    case 'STOCK_IN': {
      const item = await getItem(ctx, p.itemId);
      if (item.isArchived) fail('failed-precondition', 'Article archivé.');
      const location = await getLocation(ctx, p.locationId);
      const qty = qtyField(p.qty);
      const unitCost = toNum(p.unitCost);
      if (unitCost == null || unitCost < 0) fail('invalid-argument', 'Indiquez le prix unitaire d’achat (prix de la facture).');
      const wo = p.forWorkOrderId ? await workOrderFor(ctx, p.forWorkOrderId) : null;
      const at = effectiveDate(ctx, p.at);
      const reference = text(p.reference, 'référence', false, 120) || null;
      const res = await record(ctx, item, { type: 'ENTREE', qty, location, levelDelta: qty, unitCost: unitCost as number, at, reference, reason: text(p.reason, 'motif', false, 300) || null });
      let out: Applied | null = null;
      if (wo) {
        out = await record(ctx, res.item, { type: 'SORTIE', qty, location, levelDelta: -qty, unitCost: res.item.avgCost, at, wo, reference, reason: `Reçue pour ${wo.number}` });
      }
      return { id: res.move.id, number: res.move.number, outNumber: out?.move.number };
    }

    case 'STOCK_OUT': {
      const item = await getItem(ctx, p.itemId);
      const location = await getLocation(ctx, p.locationId);
      const qty = qtyField(p.qty);
      const available = item.levels?.[location.id] || 0;
      if (qty > available + 1e-9) fail('failed-precondition', `Stock insuffisant à cet emplacement (${available} ${item.unit} disponible(s)).`);
      const wo = await workOrderFor(ctx, p.workOrderId);
      let asset: Asset | null = null;
      if (!wo && p.assetId) {
        asset = await store.get<Asset>(COLL.assets, String(p.assetId));
        if (!asset) fail('not-found', 'Machine introuvable.');
      }
      const reason = text(p.reason, 'motif', false, 300) || null;
      if (!wo && !asset && !reason) fail('invalid-argument', 'Indiquez l’intervention, la machine ou le motif de la sortie.');
      const res = await record(ctx, item, { type: 'SORTIE', qty, location, levelDelta: -qty, unitCost: item.avgCost || 0, wo, asset, reason });
      return { id: res.move.id, number: res.move.number };
    }

    case 'STOCK_RETURN': {
      const src = await store.get<StockMove>(COLL.stockMoves, String(p.sourceMoveId || ''));
      if (!src || src.type !== 'SORTIE') fail('not-found', 'Sortie introuvable.');
      if (actor.role === 'TECHNICIEN' && src!.byId !== actor.id) fail('permission-denied', 'Vous ne pouvez retourner que vos propres sorties.');
      const qty = qtyField(p.qty);
      const left = roundQty(src!.qty - (src!.returnedQty || 0));
      if (qty > left + 1e-9) fail('failed-precondition', `Au plus ${left} ${src!.unit} peuvent être retourné(s) sur cette sortie.`);
      const item = await getItem(ctx, src!.itemId);
      const location = await getLocation(ctx, p.locationId || src!.locationId);
      const wo = src!.workOrderId ? await store.get<WorkOrder>(COLL.workOrders, src!.workOrderId) : null;
      const res = await record(ctx, item, {
        type: 'RETOUR', qty, location, levelDelta: qty, unitCost: src!.unitCost, wo,
        asset: src!.assetId ? ({ id: src!.assetId, code: src!.assetCode } as any) : null,
        sourceMoveId: src!.id, reason: text(p.reason, 'motif', false, 300) || `Retour sur ${src!.number}`,
      });
      await store.update(COLL.stockMoves, src!.id, { returnedQty: roundQty((src!.returnedQty || 0) + qty) });
      return { id: res.move.id, number: res.move.number };
    }

    case 'STOCK_TRANSFER': {
      const item = await getItem(ctx, p.itemId);
      const from = await getLocation(ctx, p.locationId);
      const to = await getLocation(ctx, p.toLocationId);
      if (from.id === to.id) fail('invalid-argument', 'Choisissez un emplacement de destination différent.');
      const qty = qtyField(p.qty);
      const available = item.levels?.[from.id] || 0;
      if (qty > available + 1e-9) fail('failed-precondition', `Stock insuffisant à cet emplacement (${available} ${item.unit} disponible(s)).`);
      const res = await record(ctx, item, { type: 'TRANSFERT', qty, location: from, toLocation: to, levelDelta: 0, unitCost: item.avgCost || 0, reason: text(p.reason, 'motif', false, 300) || null });
      return { id: res.move.id, number: res.move.number };
    }

    case 'STOCK_ADJUST': {
      const item = await getItem(ctx, p.itemId);
      const location = await getLocation(ctx, p.locationId);
      const counted = toNum(p.countedQty);
      if (counted == null || counted < 0) fail('invalid-argument', 'Indiquez la quantité réellement comptée.');
      const reason = text(p.reason, 'motif de l’ajustement', true, 300);
      const current = item.levels?.[location.id] || 0;
      const diff = roundQty((counted as number) - current);
      if (Math.abs(diff) < 1e-9) fail('failed-precondition', 'Aucun écart avec la quantité enregistrée.');
      const res = await record(ctx, item, { type: 'AJUSTEMENT', qty: Math.abs(diff), location, levelDelta: diff, unitCost: item.avgCost || 0, reason });
      ctx.effects.push({ type: 'audit', action: 'GMAO_STOCK_ADJUSTED', targetId: item.id, targetName: item.code, details: { location: res.move.locationName, from: current, to: counted, reason } });
      return { id: res.move.id, number: res.move.number, diff };
    }

    case 'STOCK_IMPORT': return importStock(ctx, p);
  }
  return fail('invalid-argument', `Action non gérée : ${action}`);
}

// ─── Import (référentiel + stock d'ouverture) ───────────────────────────────

interface ImportRow { code: string; name: string; family?: string; unit?: string; supplierRefs?: string; minQty?: any; store?: string; bin?: string; qty?: any; unitCost?: any }

async function importStock(ctx: Ctx, p: any) {
  const rows: ImportRow[] = Array.isArray(p.rows) ? p.rows : [];
  if (!rows.length) fail('invalid-argument', 'Fichier vide.');
  if (rows.length > 3000) fail('invalid-argument', '3 000 lignes maximum par import.');
  const { store } = ctx;
  const items = (await store.list<StockItem>(COLL.stockItems)).filter(i => !i.isArchived);
  const locations = (await store.list<StockLocation>(COLL.stockLocations)).filter(l => !l.isArchived);
  const errors: string[] = [];
  const parsed = rows.map((r, i) => {
    const line = i + 2;
    const code = String(r.code || '').trim().toUpperCase();
    const name = String(r.name || '').trim();
    const qty = toNum(r.qty) ?? 0;
    const unitCost = toNum(r.unitCost);
    const minQty = toNum(r.minQty);
    const existing = items.find(it => it.code.toUpperCase() === code);
    if (!code) errors.push(`Ligne ${line} : référence manquante.`);
    else if (code.length > 40) errors.push(`Ligne ${line} : référence trop longue.`);
    if (!existing && !name) errors.push(`Ligne ${line} : désignation manquante pour ${code || 'la nouvelle référence'}.`);
    if (qty < 0) errors.push(`Ligne ${line} : quantité négative.`);
    if (qty > 0 && !String(r.store || '').trim()) errors.push(`Ligne ${line} : magasin manquant pour une quantité en stock.`);
    if (qty > 0 && (unitCost == null || unitCost < 0)) errors.push(`Ligne ${line} : prix unitaire manquant pour valoriser le stock.`);
    return { line, code, name, family: String(r.family || '').trim(), unit: String(r.unit || '').trim(), supplierRefs: String(r.supplierRefs || ''), minQty, storeName: String(r.store || '').trim(), binName: String(r.bin || '').trim(), qty: roundQty(qty), unitCost: unitCost ?? 0, existing };
  });
  const seen = new Map<string, number>();
  for (const r of parsed) {
    if (!r.code) continue;
    if (r.qty === 0 && seen.has(r.code)) errors.push(`Ligne ${r.line} : référence ${r.code} en double.`);
    seen.set(r.code, r.line);
  }
  if (errors.length) return { created: 0, updated: 0, locations: 0, moves: 0, errors: errors.slice(0, 50) };

  let createdLocations = 0, createdItems = 0, moves = 0;
  const findOrCreateLocation = async (storeName: string, binName: string): Promise<StockLocation> => {
    let mag = locations.find(l => l.kind === 'MAGASIN' && keyOf(l.name) === keyOf(storeName));
    if (!mag) {
      const { id } = await handleStockAction(ctx, 'STOCK_LOCATION_SAVE', { kind: 'MAGASIN', name: storeName });
      mag = (await store.get<StockLocation>(COLL.stockLocations, id))!;
      locations.push(mag); createdLocations++;
    }
    if (!binName) return mag;
    let bin = locations.find(l => l.kind === 'CASIER' && l.parentId === mag!.id && keyOf(l.name) === keyOf(binName));
    if (!bin) {
      const { id } = await handleStockAction(ctx, 'STOCK_LOCATION_SAVE', { kind: 'CASIER', name: binName, parentId: mag.id });
      bin = (await store.get<StockLocation>(COLL.stockLocations, id))!;
      locations.push(bin); createdLocations++;
    }
    return bin;
  };
  const byCode = new Map(items.map(i => [i.code.toUpperCase(), i.id]));
  for (const r of parsed) {
    let itemId = byCode.get(r.code);
    if (!itemId) {
      ({ id: itemId } = await handleStockAction(ctx, 'STOCK_ITEM_SAVE', { code: r.code, name: r.name, family: r.family, unit: r.unit, supplierRefs: r.supplierRefs, minQty: r.minQty }));
      byCode.set(r.code, itemId!);
      createdItems++;
    }
    if (r.qty > 0) {
      const location = await findOrCreateLocation(r.storeName, r.binName);
      const item = await getItem(ctx, itemId);
      await record(ctx, item, { type: 'ENTREE', qty: r.qty, location, levelDelta: r.qty, unitCost: r.unitCost, reason: 'Stock d’ouverture (import)', opening: true });
      moves++;
    }
  }
  ctx.effects.push({ type: 'audit', action: 'GMAO_STOCK_IMPORTED', details: { items: createdItems, locations: createdLocations, moves } });
  return { created: createdItems, locations: createdLocations, moves, errors: [] };
}

// ─── États pour la comptabilité (calculés à partir du journal) ──────────────

const byProcessing = (a: StockMove, b: StockMove) => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number);

export interface SnapshotLine { itemId: string; qty: number; avgCost: number; byLocation: Record<string, number> }

/** Stock à une date : quantités par emplacement et PMP connus à cette date (mouvements datés au plus tard à `beforeIso`, exclu). */
export function stockSnapshot(moves: StockMove[], beforeIso: string): Map<string, SnapshotLine> {
  const out = new Map<string, SnapshotLine>();
  const line = (id: string) => {
    let l = out.get(id);
    if (!l) { l = { itemId: id, qty: 0, avgCost: 0, byLocation: {} }; out.set(id, l); }
    return l;
  };
  for (const m of [...moves].filter(x => x.at < beforeIso).sort(byProcessing)) {
    const l = line(m.itemId);
    const add = (loc: string, d: number) => { l.byLocation[loc] = roundQty((l.byLocation[loc] || 0) + d); };
    if (m.type === 'TRANSFERT') { add(m.locationId, -m.qty); if (m.toLocationId) add(m.toLocationId, m.qty); }
    else add(m.locationId, m.delta);
    l.qty = roundQty(l.qty + m.delta);
    l.avgCost = m.avgCostAfter;
  }
  for (const l of out.values()) for (const k of Object.keys(l.byLocation)) if (Math.abs(l.byLocation[k]) < 1e-9) delete l.byLocation[k];
  return out;
}

export interface RecapLine {
  itemId: string; code: string; name: string; family: string; unit: string;
  openQty: number; openValue: number;
  inQty: number; inValue: number;
  outQty: number; outValue: number;
  returnQty: number; returnValue: number;
  adjustQty: number; adjustValue: number;
  closeQty: number; closeValue: number;
  /** Écart dû au prix moyen pondéré (arrondis, retours au prix d'origine). */
  valuationGap: number;
}

/** Bornes d'un mois civil dans le fuseau de l'organisation (ISO UTC). */
export function monthBounds(year: number, month: number, utcOffsetMinutes: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1) - utcOffsetMinutes * 60000).toISOString();
  const end = new Date(Date.UTC(year, month, 1) - utcOffsetMinutes * 60000).toISOString();
  return { start, end };
}

/** Récapitulatif d'une période [start, end[ : stock d'ouverture + entrées − sorties + retours ± ajustements = stock de clôture. */
export function periodRecap(moves: StockMove[], items: StockItem[], start: string, end: string): RecapLine[] {
  const open = stockSnapshot(moves, start);
  const close = stockSnapshot(moves, end);
  const inPeriod = moves.filter(m => m.at >= start && m.at < end);
  const ids = new Set<string>([...open.keys(), ...close.keys(), ...inPeriod.map(m => m.itemId)]);
  const lines: RecapLine[] = [];
  for (const id of ids) {
    const it = items.find(i => i.id === id);
    const mv = inPeriod.filter(m => m.itemId === id);
    const sum = (t: StockMoveType, f: 'qty' | 'value' | 'delta') => mv.filter(m => m.type === t).reduce((s, m) => s + (m[f] as number), 0);
    const o = open.get(id), c = close.get(id);
    const openValue = xpf((o?.qty || 0) * (o?.avgCost || 0));
    const closeValue = xpf((c?.qty || 0) * (c?.avgCost || 0));
    const l: RecapLine = {
      itemId: id, code: it?.code || mv[0]?.itemCode || '?', name: it?.name || mv[0]?.itemName || '', family: it?.family || '', unit: it?.unit || mv[0]?.unit || '',
      openQty: o?.qty || 0, openValue,
      inQty: roundQty(sum('ENTREE', 'qty')), inValue: sum('ENTREE', 'value'),
      outQty: roundQty(sum('SORTIE', 'qty')), outValue: sum('SORTIE', 'value'),
      returnQty: roundQty(sum('RETOUR', 'qty')), returnValue: sum('RETOUR', 'value'),
      adjustQty: roundQty(sum('AJUSTEMENT', 'delta')), adjustValue: sum('AJUSTEMENT', 'value'),
      closeQty: c?.qty || 0, closeValue,
      valuationGap: 0,
    };
    l.valuationGap = l.closeValue - (l.openValue + l.inValue - l.outValue + l.returnValue + l.adjustValue);
    if (l.openQty || l.closeQty || mv.length) lines.push(l);
  }
  return lines.sort((a, b) => a.code.localeCompare(b.code));
}
