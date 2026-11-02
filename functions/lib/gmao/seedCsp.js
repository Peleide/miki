"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedCspDemo = seedCspDemo;
// Démonstration CSP (données fictives) : plateforme de Ducos, ISD de Gadji, quais d'apport volontaire.
// Engins, broyeur, camions ampliroll, véhicules légers, bennes ; ~120 jours d'activité rejoués.
const core_1 = require("./core");
const model_1 = require("./model");
const DAY = 86400000;
const NC_OFFSET_H = 11;
function nc(now, dayOffset, hour, minute = 0) {
    const local = new Date(now.getTime() + NC_OFFSET_H * 3600000);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour - NC_OFFSET_H, minute));
}
const dowOf = (d) => new Date(d.getTime() + NC_OFFSET_H * 3600000).getUTCDay();
const isWeekend = (d) => { const w = dowOf(d); return w === 0 || w === 6; };
function workdayOffset(now, n) {
    let offset = 0, count = -1;
    for (;;) {
        const w = dowOf(new Date(now.getTime() + offset * DAY));
        if (w !== 0 && w !== 6)
            count++;
        if (count === n)
            return offset;
        offset++;
    }
}
const monthly = (interval) => ({ freq: 'MONTHLY', interval, monthlyMode: 'DAY', end: { type: 'NEVER' }, anchor: 'CALENDRIER' });
const weekly = (interval, byWeekday) => ({ freq: 'WEEKLY', interval, byWeekday, end: { type: 'NEVER' }, anchor: 'CALENDRIER' });
async function seedCspDemo(store, users, now = new Date(), onClientCreated) {
    const resp = { id: users.responsable.id, name: users.responsable.name, role: 'RESPONSABLE' };
    const [jordan, steeve, willy] = users.techniciens.map(t => ({ id: t.id, name: t.name, role: 'TECHNICIEN' }));
    const run = async (actor, when, action, payload) => (0, core_1.handleGmaoAction)({ store, actor, now: when, effects: [] }, action, payload);
    const pub = async (when, payload) => (0, core_1.handlePublicAction)({ store, actor: { id: 'public', name: payload.name, role: 'CLIENT' }, now: when, effects: [] }, 'REPORT', { elapsedMs: 25000, ...payload });
    const at = (days, hour = 8, minute = 0) => nc(now, days, hour, minute);
    const START = -120;
    const T0 = at(START - 5);
    // ── Référentiels ──
    const take5 = (await run(resp, T0, 'CHECKLIST_SAVE', {
        name: 'Take 5 — analyse avant intervention', kind: 'SECURITE', items: [
            { label: "J'ai identifié les dangers (énergies, circulation, co-activité)", type: 'BOOLEAN', required: true },
            { label: 'Énergies consignées / machine sécurisée', type: 'BOOLEAN', required: true },
            { label: 'Zone balisée', type: 'BOOLEAN', required: true },
            { label: 'EPI adaptés portés', type: 'BOOLEAN', required: true },
            { label: "Travail isolé : quelqu'un est prévenu", type: 'BOOLEAN', required: true },
        ],
    })).id;
    await run(resp, T0, 'SETTINGS_SAVE', {
        assetCodeMode: 'MANUAL', requireApproval: true, publicReports: true, assetHierarchy: true, techniciansSelfPlan: false,
        safetyChecklistId: take5, interventionTypes: ['Mécanique', 'Hydraulique', 'Électrique', 'Pneumatique', 'Carrosserie / soudure', 'Contrôle', 'Graissage'],
    });
    const chkMensuel = (await run(resp, T0, 'CHECKLIST_SAVE', {
        name: 'Contrôle mensuel engin', kind: 'MAINTENANCE', items: [
            { label: 'Niveau huile moteur', type: 'BOOLEAN', required: true },
            { label: 'Niveau liquide de refroidissement', type: 'BOOLEAN', required: true },
            { label: 'Niveau huile hydraulique', type: 'BOOLEAN', required: true },
            { label: 'Absence de fuite', type: 'BOOLEAN', required: true },
            { label: 'État pneumatiques / chenilles', type: 'CHOICE', options: ['Bon', 'Usure à surveiller', 'À remplacer'], required: true },
            { label: 'Graissage des articulations', type: 'BOOLEAN', required: true },
            { label: 'Éclairage, gyrophare et avertisseur de recul', type: 'BOOLEAN', required: true },
            { label: 'Observations', type: 'TEXT', required: false },
        ],
    })).id;
    const chkVidange = (await run(resp, T0, 'CHECKLIST_SAVE', {
        name: 'Vidange moteur', kind: 'MAINTENANCE', items: [
            { label: 'Huile moteur vidangée', type: 'BOOLEAN', required: true },
            { label: 'Filtre à huile remplacé', type: 'BOOLEAN', required: true },
            { label: 'Filtre à gasoil remplacé', type: 'BOOLEAN', required: true },
            { label: 'Filtre à air contrôlé / remplacé', type: 'BOOLEAN', required: true },
            { label: "Quantité d'huile (L)", type: 'NUMBER', required: true },
        ],
    })).id;
    const chkBroyeur = (await run(resp, T0, 'CHECKLIST_SAVE', {
        name: 'Entretien broyeur', kind: 'MAINTENANCE', items: [
            { label: 'Marteaux / couteaux contrôlés', type: 'BOOLEAN', required: true },
            { label: 'Tapis convoyeurs intérieur et extérieur contrôlés', type: 'BOOLEAN', required: true },
            { label: 'Rouleaux des convoyeurs graissés', type: 'BOOLEAN', required: true },
            { label: "Arrêts d'urgence testés", type: 'BOOLEAN', required: true },
            { label: 'Photo de la grille', type: 'PHOTO', required: false },
            { label: 'Observations', type: 'TEXT', required: false },
        ],
    })).id;
    const chkCamion = (await run(resp, T0, 'CHECKLIST_SAVE', {
        name: 'Révision poids lourd', kind: 'MAINTENANCE', items: [
            { label: 'Vidange moteur et filtres', type: 'BOOLEAN', required: true },
            { label: 'Contrôle freinage', type: 'BOOLEAN', required: true },
            { label: 'Bras ampliroll : vérins et flexibles', type: 'BOOLEAN', required: true },
            { label: 'Graissage châssis', type: 'BOOLEAN', required: true },
            { label: 'Kilométrage relevé', type: 'NUMBER', required: true },
        ],
    })).id;
    const ducos = (await run(resp, T0, 'SITE_SAVE', { name: 'Plateforme de Ducos', address: 'Ducos, Nouméa' })).id;
    const gadji = (await run(resp, T0, 'SITE_SAVE', { name: 'ISD de Gadji', address: 'Païta' })).id;
    const qav = (await run(resp, T0, 'SITE_SAVE', { name: "Quais d'apport volontaire", address: 'Grand Nouméa' })).id;
    const atelier = (await run(resp, T0, 'SITE_SAVE', { name: 'Atelier maintenance', address: 'Ducos' })).id;
    const exploitGadji = (await run(resp, T0, 'CLIENT_SAVE', { name: 'Exploitation ISD Gadji', contactName: "Chef d'exploitation (fictif)", phone: '00 00 00', notes: 'Service interne : consulte ses engins et signale les pannes.' })).id;
    if (onClientCreated)
        await onClientCreated(exploitGadji);
    const client = { id: users.client.id, name: users.client.name, role: 'CLIENT', clientId: exploitGadji };
    await run(resp, T0, 'KIT_APPLY', { kitId: 'VEHICULES' });
    const typo = async (name, meterType, defaultChecklistId = null) => (await run(resp, T0, 'TYPOLOGY_SAVE', { name, meterType, defaultChecklistId })).id;
    const typs = await store.list(model_1.COLL.typologies);
    const VL = typs.find(t => t.name === 'Véhicule léger').id;
    const CHARG = await typo('Chargeuse', 'HEURES', chkMensuel);
    const PELLE = await typo('Pelle hydraulique', 'HEURES', chkMensuel);
    const COMPA = await typo('Compacteur', 'HEURES', chkMensuel);
    const BROY = await typo('Broyeur', 'HEURES', chkBroyeur);
    const AMPLI = await typo('Camion ampliroll', 'KM', chkCamion);
    const BENNE = await typo('Benne', null);
    const CFIXE = await typo('Compacteur à poste fixe', null);
    const SOUS = await typo('Sous-ensemble', null);
    // ── Parc ──
    const mk = async (p) => (await run(resp, at(START), 'ASSET_CREATE', p)).id;
    const EN486 = await mk({ code: 'EN486', name: 'Chargeuse Liebherr L550', typologyId: CHARG, siteId: ducos, brand: 'Liebherr', model: 'L550', serialNumber: 'L550-1187', meterValue: 7480, technicianIds: [jordan.id, steeve.id], location: 'Plateforme de tri', contactName: 'Chef de quai Ducos (fictif)', contactPhone: '00 00 01' });
    const EN486H = await mk({ code: 'EN486-HYD', name: 'Circuit hydraulique', typologyId: SOUS, parentId: EN486 });
    await mk({ code: 'EN486-HYD-V1', name: 'Vérin de levage', typologyId: SOUS, parentId: EN486H });
    await mk({ code: 'EN486-ECL', name: 'Phares et gyrophare', typologyId: SOUS, parentId: EN486 });
    const MAT504 = await mk({ code: 'MAT504', name: 'Broyeur de déchets verts', typologyId: BROY, siteId: ducos, brand: 'Doppstadt', model: 'AK 430', meterValue: 2610, technicianIds: [willy.id, steeve.id], location: 'Plateforme déchets verts' });
    const CONVI = await mk({ code: 'MAT504-CI', name: 'Convoyeur intérieur', typologyId: SOUS, parentId: MAT504 });
    await mk({ code: 'MAT504-CI-R', name: 'Rouleaux convoyeur intérieur', typologyId: SOUS, parentId: CONVI });
    await mk({ code: 'MAT504-CE', name: 'Convoyeur extérieur', typologyId: SOUS, parentId: MAT504 });
    const PL210 = await mk({ code: 'PL210', name: 'Camion ampliroll Renault C430', typologyId: AMPLI, siteId: ducos, brand: 'Renault', model: 'C430', registration: 'NC-DEMO-210', meterValue: 168400, technicianIds: [jordan.id] });
    const PL215 = await mk({ code: 'PL215', name: 'Camion ampliroll Volvo FMX', typologyId: AMPLI, siteId: gadji, clientId: exploitGadji, brand: 'Volvo', model: 'FMX', registration: 'NC-DEMO-215', meterValue: 129500, technicianIds: [jordan.id] });
    const VL474 = await mk({ code: 'VL474', name: 'Pick-up Toyota Hilux', typologyId: VL, siteId: atelier, brand: 'Toyota', model: 'Hilux', registration: 'NC-DEMO-474', meterValue: 93100, technicianIds: [], contactName: 'Responsable maintenance', contactPhone: '00 00 02' });
    const VL480 = await mk({ code: 'VL480', name: 'Toyota Land Cruiser', typologyId: VL, siteId: gadji, clientId: exploitGadji, brand: 'Toyota', model: 'Land Cruiser 70', registration: 'NC-DEMO-480', meterValue: 61200, technicianIds: [] });
    const EN512 = await mk({ code: 'EN512', name: 'Compacteur Bomag BC 772', typologyId: COMPA, siteId: gadji, clientId: exploitGadji, brand: 'Bomag', model: 'BC 772', meterValue: 11320, technicianIds: [steeve.id], location: 'Alvéole en exploitation' });
    const EN520 = await mk({ code: 'EN520', name: 'Pelle Caterpillar 320', typologyId: PELLE, siteId: gadji, clientId: exploitGadji, brand: 'Caterpillar', model: '320', meterValue: 5980, technicianIds: [steeve.id], location: 'Alvéole en exploitation' });
    const BEN031 = await mk({ code: 'BEN031', name: 'Benne 30 m³', typologyId: BENNE, siteId: ducos, technicianIds: [] });
    await mk({ code: 'BEN032', name: 'Benne 30 m³', typologyId: BENNE, siteId: ducos, technicianIds: [] });
    await mk({ code: 'BEN033', name: 'Benne 15 m³ gravats', typologyId: BENNE, siteId: qav, technicianIds: [] });
    const IF410 = await mk({ code: 'IF410', name: 'Compacteur à poste fixe — quai 1', typologyId: CFIXE, siteId: qav, technicianIds: [willy.id], location: 'Quai n° 1' });
    const IF411 = await mk({ code: 'IF411', name: 'Compacteur à poste fixe — quai 2', typologyId: CFIXE, siteId: qav, technicianIds: [willy.id], location: 'Quai n° 2' });
    // ── Gammes préventives ──
    const pm = async (p) => run(resp, at(START), 'PM_SAVE', p);
    await pm({ name: 'Vidange moteur 500 h', trigger: 'COMPTEUR', meterInterval: 500, alertBefore: 40, assetIds: [EN486, EN512, EN520], interventionType: 'Mécanique', priority: 'P3', checklistId: chkVidange, estimatedHours: 3, consumables: 'Huile 15W40, filtres huile / gasoil / air', safetyCheckRequired: true, procedure: '1. Engin à plat, moteur tiède, consigné.\n2. Vidanger, remplacer les filtres.\n3. Refaire les niveaux, contrôler l’absence de fuite.' });
    await pm({ name: 'Contrôle mensuel engin', trigger: 'CALENDAIRE', recurrence: monthly(1), firstDate: at(START + 6).toISOString().slice(0, 10), alertBefore: 5, assetIds: [EN486, EN512, EN520], interventionType: 'Contrôle', priority: 'P3', checklistId: chkMensuel, estimatedHours: 1.5 });
    await pm({ name: 'Entretien broyeur', trigger: 'CALENDAIRE', recurrence: weekly(2, [0]), alertBefore: 2, assetIds: [MAT504], interventionType: 'Mécanique', priority: 'P2', checklistId: chkBroyeur, estimatedHours: 2, safetyCheckRequired: true });
    await pm({ name: 'Révision 20 000 km', trigger: 'COMPTEUR', meterInterval: 20000, alertBefore: 1500, assetIds: [PL210, PL215], interventionType: 'Mécanique', priority: 'P3', checklistId: chkCamion, estimatedHours: 4 });
    await pm({ name: 'Contrôle trimestriel compacteur fixe', trigger: 'CALENDAIRE', recurrence: monthly(3), firstDate: at(START + 20).toISOString().slice(0, 10), alertBefore: 10, assetIds: [IF410, IF411], interventionType: 'Hydraulique', priority: 'P3', estimatedHours: 2, safetyCheckRequired: true });
    const answersFor = async (checklistId, asset) => {
        if (!checklistId)
            return undefined;
        const chk = await store.get(model_1.COLL.checklists, checklistId);
        const a = {};
        chk?.items.forEach(i => {
            if (i.type === 'BOOLEAN')
                a[i.id] = { value: true };
            else if (i.type === 'CHOICE')
                a[i.id] = { value: i.options[Math.random() < 0.8 ? 0 : 1] };
            else if (i.type === 'NUMBER')
                a[i.id] = { value: i.label.startsWith('Quantité') ? 28 : asset?.meterValue || 1 };
            else if (i.type === 'TEXT')
                a[i.id] = { value: i.required ? 'RAS' : '' };
        });
        return a;
    };
    const safetyAnswers = async () => answersFor(take5);
    const techFor = (w) => [jordan, steeve, willy].find(t => w.assigneeIds.includes(t.id)) || jordan;
    const complete = async (woId, tech, start, hours, report, extra = {}) => {
        const wo = (await store.get(model_1.COLL.workOrders, woId));
        const asset = (await store.get(model_1.COLL.assets, wo.assetId));
        const end = new Date(start.getTime() + hours * 3600000);
        if (wo.status === 'A_PLANIFIER' && !extra.noPlan) {
            await run(resp, new Date(start.getTime() - 20 * 3600000), 'WO_PLAN', { id: woId, assigneeIds: [tech.id], plannedStart: start.toISOString(), plannedEnd: end.toISOString() });
        }
        delete extra.noPlan;
        await run(tech, new Date(end.getTime() + 10 * 60000), 'WO_CLOSE', {
            id: woId, report, actualStart: start.toISOString(), actualEnd: end.toISOString(),
            checklistAnswers: await answersFor(wo.checklistId, asset), safetyAnswers: await safetyAnswers(),
            assetStateAfter: 'OPERATIONNEL', meterAtClose: asset.meterType ? asset.meterValue : undefined, ...extra,
        });
    };
    // ── Historique rejoué ──
    const perWeek = { [EN486]: 36, [EN512]: 30, [EN520]: 32, [MAT504]: 18, [PL210]: 1250, [PL215]: 1100, [VL474]: 450, [VL480]: 380 };
    const skip = new Set();
    for (let d = START; d <= 0; d++) {
        const day = at(d);
        if (dowOf(day) === 1) {
            for (const [id, w] of Object.entries(perWeek)) {
                const a = (await store.get(model_1.COLL.assets, id));
                const who = [jordan, steeve, willy].find(t => (a.technicianIds || []).includes(t.id)) || jordan;
                await run(who, at(d, 7, 10), 'METER_ADD', { id, value: Math.round((a.meterValue || 0) + w * (0.85 + Math.random() * 0.3)) });
            }
        }
        await (0, core_1.runPreventiveScan)({ store, actor: { id: 'system', name: 'Planification automatique', role: 'RESPONSABLE' }, now: at(d, 5), effects: [] });
        if (d > -3 || isWeekend(day))
            continue;
        const open = (await store.list(model_1.COLL.workOrders))
            .filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER' && new Date(w.createdAt).getTime() <= at(d - 3).getTime());
        for (const w of open) {
            // Laissés ouverts : contrôle mensuel de la pelle (en retard, sans doublon) et vidange du compacteur (alerte compteur).
            if (w.assetId === EN520 && w.title.startsWith('Contrôle mensuel') && new Date(w.createdAt).getTime() > at(-45).getTime()) {
                skip.add(w.id);
                continue;
            }
            if (w.assetId === EN512 && w.title.startsWith('Vidange') && new Date(w.createdAt).getTime() > at(-25).getTime()) {
                skip.add(w.id);
                continue;
            }
            if (new Date(w.createdAt).getTime() > at(-8).getTime())
                continue;
            const report = w.title.startsWith('Vidange') ? 'Vidange réalisée, 3 filtres remplacés. RAS.'
                : w.title.startsWith('Entretien broyeur') ? 'Rouleaux graissés, 2 marteaux retournés, AU testés OK.'
                    : w.title.startsWith('Révision') ? 'Révision faite, plaquettes AV à prévoir à la prochaine.'
                        : 'Réalisé selon la gamme. RAS.';
            await complete(w.id, techFor(w), at(d, 13), w.estimatedHours || 1, report);
        }
    }
    // ── Curatif clôturé ──
    {
        const r = await run(client, at(-70, 9, 30), 'REQUEST_CREATE', { assetId: EN520, description: 'Fuite d’huile sur le flexible du godet, flaque sous la pelle le matin.', declaredState: 'DEGRADE' });
        const req = (await store.list(model_1.COLL.requests)).find(x => x.id === r.id) || (await store.list(model_1.COLL.requests)).find(x => x.number === r.number);
        const ap = r.workOrderId ? r : await run(resp, at(-70, 10, 15), 'REQUEST_APPROVE', { id: req.id, title: 'Fuite flexible godet', priority: 'P2', assigneeIds: [steeve.id] });
        await complete(ap.workOrderId, steeve, at(-69, 7, 30), 2, 'Flexible de godet remplacé (réf. stock atelier), niveau hydraulique refait.');
    }
    {
        const r = await pub(at(-48, 14, 5), { token: (await store.get(model_1.COLL.assets, IF410)).qrToken, name: 'Gardien du quai', description: 'Le compacteur force et s’arrête en milieu de cycle.', declaredState: 'DEGRADE' });
        const req = (await store.list(model_1.COLL.requests)).find(x => x.number === r.number);
        const ap = await run(resp, at(-48, 15), 'REQUEST_APPROVE', { id: req.id, title: 'Compacteur quai 1 : arrêt en cycle', priority: 'P2', assigneeIds: [willy.id] });
        await complete(ap.workOrderId, willy, at(-47, 8), 3, 'Fin de course encrassé nettoyé, pression réglée à 180 bar. Essais OK.');
    }
    {
        const r = await pub(at(-30, 21, 40), { token: (await store.get(model_1.COLL.assets, BEN031)).qrToken, name: 'Test', description: 'essai essai essai' });
        const req = (await store.list(model_1.COLL.requests)).find(x => x.number === r.number);
        await run(resp, at(-29, 7, 30), 'REQUEST_CANCEL', { id: req.id, reason: 'Faux signalement (essai du QR code).', falseReport: true });
    }
    {
        await run(jordan, at(-20, 10), 'WO_RECORD', { assetId: PL210, title: 'Feu de gabarit arrière HS', interventionType: 'Électrique', report: 'Ampoule et cabochon remplacés.', actualStart: at(-20, 9).toISOString(), actualEnd: at(-20, 9, 40).toISOString(), safetyAnswers: await safetyAnswers(), assetStateAfter: 'OPERATIONNEL' });
    }
    {
        const r = await run(client, at(-12, 11), 'REQUEST_CREATE', { kind: 'REMARQUE', assetId: EN512, description: 'Merci de prévenir le chef de poste avant d’immobiliser le compacteur (alvéole en exploitation).' });
        await run(resp, at(-12, 14), 'REQUEST_ACK', { id: r.id, note: 'Noté : appel du chef de poste la veille de chaque intervention.' });
    }
    // ── Situation actuelle ──
    const wd = (n) => workdayOffset(now, n);
    await pub(at(-1, 15, 50), { token: (await store.get(model_1.COLL.assets, MAT504)).qrToken, name: 'Opérateur broyeur (équipe après-midi)', contact: '00 00 03', description: "Le bouton d'arrêt d'urgence côté convoyeur extérieur reste enfoncé et ne coupe plus le tapis.", safety: true, declaredState: 'INDISPONIBLE' });
    await run(client, at(0, 7, 20), 'REQUEST_CREATE', { assetId: VL480, description: 'Voyant de pression des pneus allumé depuis ce matin.', declaredState: 'DEGRADE' });
    {
        const r = await run(resp, at(-6, 9), 'WO_CREATE', { assetId: EN486, title: 'Vérin de levage : suintement', priority: 'P3', interventionType: 'Hydraulique', estimatedHours: 3, assigneeIds: [jordan.id] });
        await run(jordan, at(-5, 8), 'WO_START', { id: r.id, safetyAnswers: await safetyAnswers() });
        await run(jordan, at(-5, 10), 'WO_HOLD', { id: r.id, reason: 'Kit de joints commandé chez le fournisseur (livraison sous 8 jours).' });
    }
    const planNew = async (assetId, title, tech, workday, h1, h2, extra = {}) => {
        const wo = await run(resp, at(-2, 10), 'WO_CREATE', { assetId, title, priority: extra.priority || 'P3', interventionType: extra.interventionType || 'Mécanique', estimatedHours: h2 - h1, assigneeIds: [tech.id] });
        await run(resp, at(-2, 11), 'WO_PLAN', { id: wo.id, assigneeIds: [tech.id], plannedStart: at(wd(workday), h1).toISOString(), plannedEnd: at(wd(workday), h2).toISOString() });
    };
    await planNew(PL215, 'Remplacer les plaquettes de frein AV', jordan, 1, 7, 10, { interventionType: 'Mécanique', priority: 'P2' });
    await planNew(IF411, 'Contrôle flexibles vérin de poussée', willy, 2, 8, 10, { interventionType: 'Hydraulique' });
    await planNew(VL474, 'Pneus avant à remplacer', jordan, 3, 13, 14, { interventionType: 'Pneumatique' });
    const openPm = (await store.list(model_1.COLL.workOrders)).filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER' && !skip.has(w.id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const [i, w] of openPm.slice(0, 2).entries()) {
        const tech = techFor(w);
        await run(resp, at(-1, 10), 'WO_PLAN', { id: w.id, assigneeIds: [tech.id], plannedStart: at(wd(i + 1), 13).toISOString(), plannedEnd: at(wd(i + 1), 15).toISOString() });
    }
    const task = async (p) => run(resp, at(-2, 9), 'TASK_SAVE', p);
    await task({ title: 'Point maintenance hebdomadaire', kind: 'REUNION', assigneeIds: [jordan.id, steeve.id, willy.id, resp.id], start: at(wd(0), 7).toISOString(), end: at(wd(0), 7, 30).toISOString() });
    await task({ title: 'Tournée graissage engins Gadji', kind: 'TACHE', assigneeIds: [steeve.id], siteId: gadji, start: at(wd(0), 8).toISOString(), end: at(wd(0), 11).toISOString() });
    await task({ title: 'Rangement atelier + inventaire filtres', kind: 'TACHE', assigneeIds: [willy.id], siteId: atelier, start: at(wd(1), 13).toISOString(), end: at(wd(1), 16).toISOString() });
    await task({ title: 'Congé', kind: 'CONGE', assigneeIds: [steeve.id], start: at(wd(4), 6).toISOString(), end: at(wd(4), 17).toISOString() });
    return { clientId: exploitGadji };
}
//# sourceMappingURL=seedCsp.js.map