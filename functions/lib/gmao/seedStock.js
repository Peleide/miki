"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedStockDemo = seedStockDemo;
// Données de démonstration du module stock : référentiel, stock d'ouverture, entrées, pièces posées sur des
// interventions réalisées, un retour et un ajustement d'inventaire. Rejoue l'activité sur ~90 jours.
const core_1 = require("./core");
const model_1 = require("./model");
const DEMO_ROWS = [
    { code: 'VL-FH-01', name: 'Filtre à huile Toyota / Dacia', family: 'Filtration', unit: 'pièce', supplierRefs: 'W712/75 | OC 534', minQty: 3, store: 'Atelier Ducos', bin: 'A1', qty: 6, unitCost: 1450 },
    { code: 'VL-FA-02', name: 'Filtre à air Kangoo / Partner', family: 'Filtration', unit: 'pièce', minQty: 2, store: 'Atelier Ducos', bin: 'A1', qty: 3, unitCost: 2300 },
    { code: 'VL-PL-01', name: 'Plaquettes de frein avant (jeu)', family: 'Freinage', unit: 'jeu', minQty: 2, store: 'Atelier Ducos', bin: 'A2', qty: 4, unitCost: 6800 },
    { code: 'VL-AMP-H7', name: 'Ampoule H7 12 V', family: 'Électricité', unit: 'pièce', minQty: 4, store: 'Atelier Ducos', bin: 'A3', qty: 10, unitCost: 650 },
    { code: 'HUI-15W40', name: 'Huile moteur 15W40', family: 'Lubrifiants', unit: 'litre', minQty: 20, store: 'Atelier Ducos', bin: 'B1', qty: 60, unitCost: 720 },
    { code: 'AL-SQ-40', name: 'Lamelles de raclette B 40 (jeu)', family: 'Nettoyage', unit: 'jeu', supplierRefs: '6.273-206.0', minQty: 2, store: 'Atelier Ducos', bin: 'C1', qty: 3, unitCost: 5200 },
    { code: 'AL-BR-43', name: 'Brosse rouleau autolaveuse 43 cm', family: 'Nettoyage', unit: 'pièce', minQty: 1, store: 'Atelier Ducos', bin: 'C1', qty: 2, unitCost: 14500 },
    { code: 'MB-DSQ-43', name: 'Disque entraîneur monobrosse', family: 'Nettoyage', unit: 'pièce', minQty: 1, store: 'Atelier Ducos', bin: 'C2', qty: 2, unitCost: 9800 },
    { code: 'CD-BUS-01', name: 'Buse de dilution (jeu de 4)', family: 'Centrales', unit: 'jeu', minQty: 2, store: 'Atelier Ducos', bin: 'C3', qty: 5, unitCost: 3900 },
    { code: 'CD-CRP-01', name: 'Crépine d’aspiration', family: 'Centrales', unit: 'pièce', minQty: 3, store: 'Atelier Ducos', bin: 'C3', qty: 6, unitCost: 1100 },
    { code: 'CD-TUY-6', name: 'Tuyau d’aspiration 6 mm', family: 'Centrales', unit: 'mètre', minQty: 5, store: 'Camionnette', qty: 12, unitCost: 380 },
];
const DEMO_USAGE = [
    { typology: 'Véhicule léger', code: 'VL-FH-01', qty: 1 }, { typology: 'Véhicule léger', code: 'HUI-15W40', qty: 4 },
    { typology: 'Utilitaire', code: 'VL-FH-01', qty: 1 }, { typology: 'Utilitaire', code: 'HUI-15W40', qty: 5 },
    { typology: 'Autolaveuse', code: 'AL-SQ-40', qty: 1 }, { typology: 'Monobrosse', code: 'MB-DSQ-43', qty: 1 },
    { typology: 'Centrale de dilution', code: 'CD-CRP-01', qty: 1 }, { typology: 'Centrale de dilution', code: 'CD-BUS-01', qty: 1 },
];
const CSP_ROWS = [
    { code: 'FLT-HUI-CAT', name: 'Filtre à huile moteur Caterpillar', family: 'Filtration', unit: 'pièce', supplierRefs: '1R-0739 | LF16015', minQty: 3, store: 'Conteneur Gadji', bin: 'G1', qty: 5, unitCost: 4800 },
    { code: 'FLT-GO-CAT', name: 'Filtre à gasoil Caterpillar', family: 'Filtration', unit: 'pièce', supplierRefs: '1R-0751', minQty: 3, store: 'Conteneur Gadji', bin: 'G1', qty: 4, unitCost: 5600 },
    { code: 'FLT-AIR-L550', name: 'Filtre à air chargeuse L550', family: 'Filtration', unit: 'pièce', minQty: 1, store: 'Conteneur Ducos', bin: 'A1', qty: 2, unitCost: 18500 },
    { code: 'FLT-HUI-LBH', name: 'Filtre à huile Liebherr', family: 'Filtration', unit: 'pièce', minQty: 2, store: 'Conteneur Ducos', bin: 'A1', qty: 4, unitCost: 5200 },
    { code: 'HUI-15W40', name: 'Huile moteur 15W40 (fût 208 L)', family: 'Lubrifiants', unit: 'litre', minQty: 100, store: 'Dock Ducos', qty: 416, unitCost: 690 },
    { code: 'HUI-HYD-46', name: 'Huile hydraulique HV46', family: 'Lubrifiants', unit: 'litre', minQty: 100, store: 'Dock Ducos', qty: 208, unitCost: 760 },
    { code: 'GRA-EP2', name: 'Graisse EP2 (cartouche)', family: 'Lubrifiants', unit: 'pièce', minQty: 20, store: 'Conteneur Gadji', bin: 'G2', qty: 48, unitCost: 950 },
    { code: 'FLX-HYD-12', name: 'Flexible hydraulique 1/2" serti', family: 'Hydraulique', unit: 'pièce', minQty: 2, store: 'Conteneur Ducos', bin: 'B2', qty: 3, unitCost: 12400 },
    { code: 'JNT-VER-KIT', name: 'Kit joints vérin de levage', family: 'Hydraulique', unit: 'jeu', minQty: 1, store: 'Conteneur Ducos', bin: 'B2', qty: 0, unitCost: 0 },
    { code: 'MRT-BRY-01', name: 'Marteau broyeur Doppstadt', family: 'Broyeur', unit: 'pièce', supplierRefs: 'DS-4302', minQty: 8, store: 'Conteneur Ducos', bin: 'C1', qty: 16, unitCost: 21000 },
    { code: 'RLX-CONV-01', name: 'Rouleau de convoyeur', family: 'Broyeur', unit: 'pièce', minQty: 2, store: 'Conteneur Ducos', bin: 'C1', qty: 3, unitCost: 16800 },
    { code: 'PLQ-PL-AV', name: 'Plaquettes de frein avant poids lourd (jeu)', family: 'Freinage', unit: 'jeu', minQty: 1, store: 'Conteneur Ducos', bin: 'D1', qty: 2, unitCost: 32000 },
    { code: 'AMP-24V-H7', name: 'Ampoule H7 24 V', family: 'Électricité', unit: 'pièce', minQty: 6, store: 'Conteneur Ducos', bin: 'D2', qty: 14, unitCost: 900 },
    { code: 'GYRO-LED', name: 'Gyrophare LED 12-24 V', family: 'Électricité', unit: 'pièce', minQty: 1, store: 'Conteneur Ducos', bin: 'D2', qty: 2, unitCost: 15500 },
    { code: 'DNT-GDT-320', name: 'Dent de godet Cat 320', family: 'Usure', unit: 'pièce', minQty: 5, store: 'Conteneur Gadji', bin: 'G3', qty: 7, unitCost: 8900 },
];
const CSP_USAGE = [
    { typology: 'Chargeuse', code: 'FLT-HUI-LBH', qty: 1 }, { typology: 'Chargeuse', code: 'HUI-15W40', qty: 28 }, { typology: 'Chargeuse', code: 'GRA-EP2', qty: 2 },
    { typology: 'Compacteur', code: 'FLT-HUI-CAT', qty: 1 }, { typology: 'Compacteur', code: 'GRA-EP2', qty: 2 },
    { typology: 'Pelle hydraulique', code: 'FLT-HUI-CAT', qty: 1 }, { typology: 'Pelle hydraulique', code: 'GRA-EP2', qty: 3 },
    { typology: 'Broyeur', code: 'MRT-BRY-01', qty: 2 }, { typology: 'Broyeur', code: 'GRA-EP2', qty: 1 },
    { typology: 'Camion ampliroll', code: 'HUI-15W40', qty: 30 },
];
async function seedStockDemo(store, users, now = new Date(), profile = 'DEMO') {
    const resp = users.responsable;
    const run = (actor, when, action, payload) => (0, core_1.handleGmaoAction)({ store, actor, now: when, effects: [] }, action, payload);
    const day = (n, h = 8) => new Date(now.getTime() + n * 86400000 + (h - 8) * 3600000);
    const rows = profile === 'CSP' ? CSP_ROWS : DEMO_ROWS;
    const usage = profile === 'CSP' ? CSP_USAGE : DEMO_USAGE;
    await run(resp, day(-95), 'STOCK_IMPORT', { rows });
    const items = await store.list(model_1.COLL.stockItems);
    const locs = await store.list(model_1.COLL.stockLocations);
    const item = (code) => items.find(i => i.code === code);
    const loc = (storeName, bin) => {
        const mag = locs.find(l => l.kind === 'MAGASIN' && l.name === storeName);
        return bin ? locs.find(l => l.kind === 'CASIER' && l.parentId === mag.id && l.name === bin) : mag;
    };
    const rowOf = (code) => rows.find(r => r.code === code);
    const where = (code) => loc(rowOf(code).store, rowOf(code).bin);
    // Les mouvements sont rejoués dans l'ordre chronologique : le prix moyen pondéré dépend de l'ordre de saisie.
    const events = [];
    const restock = profile === 'CSP'
        ? [{ d: -60, code: 'FLT-HUI-CAT', qty: 4, cost: 5100, ref: 'Yooz BC-2026-0412' }, { d: -45, code: 'MRT-BRY-01', qty: 8, cost: 22400, ref: 'Yooz BC-2026-0455' }, { d: -20, code: 'GRA-EP2', qty: 24, cost: 990, ref: 'Yooz BC-2026-0501' }, { d: -12, code: 'HUI-15W40', qty: 208, cost: 710, ref: 'Yooz BC-2026-0533' }]
        : [{ d: -60, code: 'VL-FH-01', qty: 6, cost: 1520, ref: 'BL 88412' }, { d: -40, code: 'HUI-15W40', qty: 40, cost: 750, ref: 'BL 88577' }, { d: -18, code: 'CD-CRP-01', qty: 6, cost: 1150, ref: 'BL 88901' }];
    for (const r of restock) {
        const at = day(r.d, 9);
        events.push({ at, go: async () => { await run(resp, at, 'STOCK_IN', { itemId: item(r.code).id, locationId: where(r.code).id, qty: r.qty, unitCost: r.cost, reference: r.ref }); } });
    }
    // Pièces posées sur les interventions réalisées des 90 derniers jours
    const typologies = await store.list(model_1.COLL.typologies);
    const typName = (id) => typologies.find(t => t.id === id)?.name || '';
    const assets = await store.list(model_1.COLL.assets);
    const closed = (await store.list(model_1.COLL.workOrders))
        .filter(w => w.status === 'CLOTURE' && w.closedAt && new Date(w.closedAt).getTime() > day(-90).getTime());
    let firstOut = null;
    for (const w of closed) {
        const asset = assets.find(a => a.id === w.assetId);
        const lines = usage.filter(u => u.typology === typName(asset?.typologyId));
        if (!lines.length || (w.kind !== 'PREVENTIF' && Math.random() < 0.5))
            continue;
        const at = new Date(new Date(w.closedAt).getTime() + 60000);
        events.push({ at, go: async () => {
                for (const u of lines) {
                    const it = (await store.get(model_1.COLL.stockItems, item(u.code).id));
                    const l = where(u.code);
                    if ((it.levels?.[l.id] || 0) < u.qty)
                        continue;
                    const res = await run(resp, at, 'STOCK_OUT', { itemId: it.id, locationId: l.id, qty: u.qty, workOrderId: w.id });
                    if (!firstOut && u.qty >= 2 && at.getTime() > day(-30).getTime())
                        firstOut = { id: res.id, at };
                }
            } });
    }
    // Inventaire tournant : un écart constaté
    const adjustCode = profile === 'CSP' ? 'AMP-24V-H7' : 'VL-AMP-H7';
    events.push({ at: day(-15, 15), go: async () => {
            const adj = (await store.get(model_1.COLL.stockItems, item(adjustCode).id));
            const adjLoc = where(adjustCode);
            const current = adj.levels?.[adjLoc.id] || 0;
            if (current >= 2)
                await run(resp, day(-15, 15), 'STOCK_ADJUST', { itemId: adj.id, locationId: adjLoc.id, countedQty: current - 2, reason: 'Inventaire du casier : 2 ampoules manquantes (sorties non saisies)' });
        } });
    // Une sortie hors intervention (atelier)
    const shop = profile === 'CSP' ? 'GRA-EP2' : 'HUI-15W40';
    events.push({ at: day(-3, 10), go: async () => { await run(resp, day(-3, 10), 'STOCK_OUT', { itemId: item(shop).id, locationId: where(shop).id, qty: 2, reason: 'Appoint atelier' }); } });
    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const e of events)
        await e.go();
    // « J'en ai pris 2, j'en rends 1 »
    const out = firstOut;
    if (out)
        await run(resp, new Date(Math.max(out.at.getTime() + 3 * 3600000, day(-2).getTime())), 'STOCK_RETURN', { sourceMoveId: out.id, qty: 1, reason: 'Une seule utilisée' });
}
//# sourceMappingURL=seedStock.js.map