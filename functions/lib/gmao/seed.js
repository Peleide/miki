"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedCspDemo = seedCspDemo;
// Jeu de données de démonstration CSP (fictif mais réaliste).
// Utilisé par le mode démo du front et par scripts/seedCsp.mjs (émulateurs).
// Tout passe par handleGmaoAction : l'historique est rejoué avec des dates passées.
const core_1 = require("./core");
const model_1 = require("./model");
const DAY = 86400000;
const NC_OFFSET_H = 11; // Nouméa, UTC+11, pas d'heure d'été
/** Date ISO à partir d'une heure locale Nouméa, `dayOffset` jours après aujourd'hui. */
function nc(now, dayOffset, hour, minute = 0) {
    const local = new Date(now.getTime() + NC_OFFSET_H * 3600000);
    const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
    return new Date(Date.UTC(y, m, d + dayOffset, hour - NC_OFFSET_H, minute));
}
/** Décalage (en jours depuis aujourd'hui) du n-ième jour ouvré à venir, aujourd'hui compris (heure de Nouméa). */
function workdayOffset(now, n) {
    let offset = 0;
    let count = -1;
    for (;;) {
        const local = new Date(now.getTime() + (NC_OFFSET_H * 3600000) + offset * DAY);
        const dow = local.getUTCDay();
        if (dow !== 0 && dow !== 6)
            count++;
        if (count === n)
            return offset;
        offset++;
    }
}
async function seedCspDemo(store, users, now = new Date()) {
    const resp = { id: users.responsable.id, name: users.responsable.name, role: 'RESPONSABLE' };
    const dem = { id: users.demandeur.id, name: users.demandeur.name, role: 'DEMANDEUR' };
    const techs = users.techniciens.map(t => ({ id: t.id, name: t.name, role: 'TECHNICIEN' }));
    const [t1, t2, t3] = [techs[0], techs[1] || techs[0], techs[2] || techs[0]];
    const run = async (actor, when, action, payload) => {
        const ctx = { store, actor, now: when, effects: [] };
        return (0, core_1.handleGmaoAction)(ctx, action, payload);
    };
    const at = (days, hour = 8, minute = 0) => nc(now, days, hour, minute);
    // ── Réglages, sites, check-lists ──
    await run(resp, at(-200), 'SETTINGS_SAVE', { hourlyRate: 5500 });
    const ducos = (await run(resp, at(-200), 'SITE_SAVE', { name: 'Ducos', address: 'Rue Pelatan, Ducos' })).id;
    const gadji = (await run(resp, at(-200), 'SITE_SAVE', { name: 'Gadji', address: 'ISD de Gadji, Païta' })).id;
    const qav = (await run(resp, at(-200), 'SITE_SAVE', { name: "Quais d'apport volontaire" })).id;
    const take5 = (await run(resp, at(-200), 'CHECKLIST_SAVE', {
        name: 'Take 5 — analyse avant intervention', kind: 'SECURITE',
        description: 'À valider avant de démarrer toute intervention.',
        items: [
            { label: "J'ai identifié les dangers (énergies, circulation, co-activité)", type: 'BOOLEAN', required: true },
            { label: 'Énergies consignées / machine sécurisée', type: 'BOOLEAN', required: true },
            { label: 'Zone balisée', type: 'BOOLEAN', required: true },
            { label: 'EPI adaptés portés', type: 'BOOLEAN', required: true },
            { label: 'Outillage et moyen de levage adaptés', type: 'BOOLEAN', required: true },
            { label: 'Permis feu délivré, ou pas de point chaud', type: 'BOOLEAN', required: true },
            { label: "Travail isolé : quelqu'un est prévenu", type: 'BOOLEAN', required: true },
        ],
    })).id;
    await run(resp, at(-200), 'SETTINGS_SAVE', { safetyChecklistId: take5 });
    const chkMensuel = (await run(resp, at(-200), 'CHECKLIST_SAVE', {
        name: 'Contrôle mensuel engin', kind: 'MAINTENANCE',
        items: [
            { label: 'Niveau huile moteur', type: 'BOOLEAN', required: true },
            { label: 'Niveau liquide de refroidissement', type: 'BOOLEAN', required: true },
            { label: 'Niveau huile hydraulique', type: 'BOOLEAN', required: true },
            { label: 'Absence de fuite', type: 'BOOLEAN', required: true },
            { label: 'Pneumatiques / chenilles en bon état', type: 'BOOLEAN', required: true },
            { label: 'Graissage des articulations', type: 'BOOLEAN', required: true },
            { label: 'Éclairage et avertisseurs', type: 'BOOLEAN', required: true },
            { label: 'Observations', type: 'TEXT', required: false },
        ],
    })).id;
    const chkVidange = (await run(resp, at(-200), 'CHECKLIST_SAVE', {
        name: 'Vidange moteur', kind: 'MAINTENANCE',
        items: [
            { label: 'Huile moteur vidangée', type: 'BOOLEAN', required: true },
            { label: 'Filtre à huile remplacé', type: 'BOOLEAN', required: true },
            { label: 'Filtre à gasoil remplacé', type: 'BOOLEAN', required: true },
            { label: 'Filtre à air contrôlé / remplacé', type: 'BOOLEAN', required: true },
            { label: "Quantité d'huile (L)", type: 'NUMBER', required: true },
        ],
    })).id;
    const chkBroyeur = (await run(resp, at(-200), 'CHECKLIST_SAVE', {
        name: 'Entretien broyeur', kind: 'MAINTENANCE',
        items: [
            { label: 'Couteaux / marteaux contrôlés', type: 'BOOLEAN', required: true },
            { label: 'Tapis intérieur et extérieur contrôlés', type: 'BOOLEAN', required: true },
            { label: 'Rouleaux des convoyeurs graissés', type: 'BOOLEAN', required: true },
            { label: 'Arrêts d’urgence testés', type: 'BOOLEAN', required: true },
            { label: 'Observations', type: 'TEXT', required: false },
        ],
    })).id;
    // ── Parc ──
    const mk = async (p, days = -180) => (await run(resp, at(days), 'ASSET_CREATE', p)).id;
    const EN486 = await mk({ code: 'EN486', name: 'Chargeuse Liebherr L550', family: 'EN', siteId: ducos, company: 'CSP', brand: 'Liebherr', model: 'L550', meterType: 'HEURES', meterValue: 8120, location: 'Plateforme de tri' });
    const EN486H = await mk({ code: 'EN486-HYD', name: 'Circuit hydraulique', parentId: EN486, componentCategory: 'HYDRAULIQUE' });
    await mk({ code: 'EN486-HYD-V1', name: 'Vérin de levage', parentId: EN486H, componentCategory: 'HYDRAULIQUE' });
    await mk({ code: 'EN486-ECL', name: 'Phares et éclairage', parentId: EN486, level: 'COMPOSANT', componentCategory: 'ELECTRIQUE' });
    const MAT504 = await mk({ code: 'MAT504', name: 'Broyeur de déchets verts', family: 'IF', siteId: ducos, company: 'CSP', meterType: 'HEURES', meterValue: 3020, location: 'Plateforme déchets verts' });
    const CONVI = await mk({ code: 'MAT504-CI', name: 'Convoyeur intérieur', parentId: MAT504, componentCategory: 'MECANIQUE' });
    await mk({ code: 'MAT504-CI-R', name: 'Rouleaux convoyeur intérieur', parentId: CONVI, componentCategory: 'MECANIQUE' });
    await mk({ code: 'MAT504-CE', name: 'Convoyeur extérieur', parentId: MAT504, componentCategory: 'MECANIQUE' });
    const VL474 = await mk({ code: 'VL474', name: 'Pick-up Toyota Hilux', family: 'VL', siteId: ducos, company: 'CSP', brand: 'Toyota', model: 'Hilux', registration: 'NC-000-DEMO', meterType: 'KM', meterValue: 96800 });
    const PL210 = await mk({ code: 'PL210', name: 'Camion ampliroll Renault C430', family: 'PL', siteId: ducos, company: 'CSP', brand: 'Renault', model: 'C430', meterType: 'KM', meterValue: 182300 });
    const BEN031 = await mk({ code: 'BEN031', name: 'Benne 30 m³', family: 'BEN', siteId: ducos, company: 'CSP' });
    await mk({ code: 'BEN032', name: 'Benne 30 m³', family: 'BEN', siteId: ducos, company: 'CSP' });
    const RE012 = await mk({ code: 'RE012', name: 'Remorque porte-engin', family: 'RE', siteId: ducos, company: 'CSP' });
    const EN512 = await mk({ code: 'EN512', name: 'Compacteur Bomag BC 772', family: 'EN', siteId: gadji, company: 'SAMERTOWN', brand: 'Bomag', model: 'BC 772', meterType: 'HEURES', meterValue: 11850 });
    const EN520 = await mk({ code: 'EN520', name: 'Pelle Caterpillar 320', family: 'EN', siteId: gadji, company: 'SAMERTOWN', brand: 'Caterpillar', model: '320', meterType: 'HEURES', meterValue: 6400 });
    const IF301 = await mk({ code: 'IF301', name: 'Grue de manutention', family: 'IF', siteId: gadji, company: 'SAMERTOWN', location: 'Alvéole en exploitation' });
    const PL215 = await mk({ code: 'PL215', name: 'Camion ampliroll Volvo FMX', family: 'PL', siteId: gadji, company: 'SAMERTOWN', brand: 'Volvo', model: 'FMX', meterType: 'KM', meterValue: 141000 });
    const QAV01 = await mk({ code: 'QAV01', name: 'Quai n° 1', family: 'QAV', siteId: qav, company: 'CSP' });
    const QAV02 = await mk({ code: 'QAV02', name: 'Quai n° 2', family: 'QAV', siteId: qav, company: 'CSP' });
    const IF410 = await mk({ code: 'IF410', name: 'Compacteur à poste fixe', family: 'IF', siteId: qav, company: 'CSP', location: 'Quai n° 1' });
    // ── Gammes (créées il y a 100 jours) ──
    const pm = async (p) => (await run(resp, at(-100), 'PM_SAVE', p)).id;
    await pm({ name: 'Vidange moteur 500 h', trigger: 'COMPTEUR', intervalValue: 500, alertBefore: 40, assetIds: [EN486, EN512, EN520], interventionType: 'MECANIQUE', priority: 'P3', checklistId: chkVidange, estimatedHours: 3, consumables: 'Huile 15W40, filtres huile / gasoil / air', safetyCheckRequired: true, procedure: '1. Machine à plat, moteur tiède, consignée.\n2. Vidanger, remplacer les filtres.\n3. Refaire les niveaux, contrôler l’absence de fuite.' });
    await pm({ name: 'Contrôle mensuel engin', trigger: 'CALENDAIRE', intervalValue: 1, intervalUnit: 'MOIS', alertBefore: 5, assetIds: [EN486, EN512, EN520], firstDueAt: at(-85, 7).toISOString(), interventionType: 'MECANIQUE', priority: 'P3', checklistId: chkMensuel, estimatedHours: 1.5, safetyCheckRequired: false });
    await pm({ name: 'Entretien broyeur', trigger: 'CALENDAIRE', intervalValue: 2, intervalUnit: 'SEMAINES', alertBefore: 2, assetIds: [MAT504], firstDueAt: at(-88, 7).toISOString(), interventionType: 'MECANIQUE', priority: 'P2', checklistId: chkBroyeur, estimatedHours: 2, safetyCheckRequired: true });
    await pm({ name: 'Révision 10 000 km', trigger: 'COMPTEUR', intervalValue: 10000, alertBefore: 800, assetIds: [VL474, PL210, PL215], interventionType: 'MECANIQUE', priority: 'P3', estimatedHours: 4, safetyCheckRequired: false });
    await pm({ name: 'Vérification annuelle grue (réglementaire)', trigger: 'CALENDAIRE', intervalValue: 12, intervalUnit: 'MOIS', alertBefore: 30, assetIds: [IF301], firstDueAt: at(40, 7).toISOString(), interventionType: 'STRUCTURE', priority: 'P2', estimatedHours: 4, safetyCheckRequired: true, procedure: 'Vérification par organisme agréé. Préparer la grue et les documents.' });
    await pm({ name: 'Contrôle trimestriel QAV', trigger: 'CALENDAIRE', intervalValue: 3, intervalUnit: 'MOIS', alertBefore: 7, assetIds: [QAV01, QAV02, IF410], firstDueAt: at(-60, 7).toISOString(), interventionType: 'STRUCTURE', priority: 'P3', estimatedHours: 1, safetyCheckRequired: false });
    const settings = await store.getSettings();
    const safety = async () => {
        const chk = await store.get(model_1.COLL.checklists, settings.safetyChecklistId || take5);
        const a = {};
        chk?.items.forEach(i => { a[i.id] = { value: true }; });
        return a;
    };
    const answersFor = async (checklistId) => {
        if (!checklistId)
            return undefined;
        const chk = await store.get(model_1.COLL.checklists, checklistId);
        const a = {};
        chk?.items.forEach(i => { a[i.id] = { value: i.type === 'BOOLEAN' ? true : i.type === 'NUMBER' ? 18 : 'RAS' }; });
        return a;
    };
    /** Planifie, démarre et clôture un BT à des dates passées. */
    const complete = async (woId, tech, start, hours, report, extra = {}) => {
        const wo = (await store.get(model_1.COLL.workOrders, woId));
        const end = new Date(start.getTime() + hours * 3600000);
        if (wo.status === 'A_PLANIFIER' || wo.status === 'EN_ATTENTE') {
            await run(resp, new Date(start.getTime() - 2 * 3600000), 'WO_PLAN', { id: woId, assigneeIds: extra.assigneeIds || [tech.id], plannedStart: start.toISOString(), plannedEnd: end.toISOString(), resourceType: extra.resourceType, externalProvider: extra.externalProvider });
        }
        const closer = extra.resourceType === 'EXTERNE' ? resp : tech;
        if (extra.resourceType !== 'EXTERNE') {
            await run(closer, start, 'WO_START', { id: woId, safetyAnswers: wo.safetyCheckRequired ? await safety() : undefined });
        }
        await run(closer, new Date(end.getTime() + 10 * 60000), 'WO_CLOSE', {
            id: woId, report, actualStart: start.toISOString(), actualEnd: end.toISOString(),
            checklistAnswers: await answersFor(wo.checklistId), assetStateAfter: 'OPERATIONNEL', ...extra,
        });
    };
    // ── Historique : 90 jours rejoués jour par jour ──
    const meterDaily = { [EN486]: 6, [EN512]: 7, [EN520]: 5, [MAT504]: 4, [VL474]: 110, [PL210]: 160, [PL215]: 140 };
    const techCycle = [t1, t2, t3];
    let k = 0;
    for (let d = -90; d <= 0; d++) {
        // Relevés compteurs le lundi et le jeudi
        const local = new Date(at(d).getTime() + NC_OFFSET_H * 3600000);
        if ([1, 4].includes(local.getUTCDay())) {
            for (const [id, perDay] of Object.entries(meterDaily)) {
                const asset = (await store.get(model_1.COLL.assets, id));
                const days = local.getUTCDay() === 1 ? 4 : 3;
                await run(techCycle[k++ % 3], at(d, 7, 30), 'METER_ADD', { id, value: Math.round((asset.meterValue || 0) + perDay * days) });
            }
        }
        await (0, core_1.runPreventiveScan)({ store, actor: { id: 'system', name: 'Planification automatique', role: 'RESPONSABLE' }, now: at(d, 5), effects: [] });
        // Les préventifs générés il y a plus de 8 jours ont été réalisés (sauf un, laissé en retard)
        if (d <= -2) {
            const open = (await store.list(model_1.COLL.workOrders))
                .filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER'
                && new Date(w.createdAt).getTime() <= at(d - 6).getTime()
                && new Date(w.createdAt).getTime() <= at(-12).getTime()); // les plus récents restent à planifier
            for (const w of open) {
                if (w.assetCode === 'QAV02')
                    continue; // laissé en retard volontairement
                await complete(w.id, techCycle[k++ % 3], at(d, 13), w.estimatedHours || 1.5, 'Réalisé selon la gamme. RAS.');
            }
        }
    }
    // ── Correctifs clôturés ──
    const corrective = async (when, actor, assetId, description, impact, declaredState, closeAfterH, report, tech, durH, extra = {}) => {
        const r = await run(actor, when, 'REQUEST_CREATE', { assetId, description, impact, declaredState });
        const ap = await run(resp, new Date(when.getTime() + 40 * 60000), 'REQUEST_APPROVE', { id: r.id, interventionType: extra.interventionType || 'MECANIQUE' });
        await complete(ap.workOrderId, tech, new Date(when.getTime() + closeAfterH * 3600000), durH, report, extra);
    };
    await corrective(at(-60, 9), dem, EN486, 'Fuite hydraulique importante sur le vérin de levage, machine arrêtée.', { safety: false, regulatory: false, production: 'ARRET' }, 'INDISPONIBLE', 3, 'Joint de tige du vérin de levage remplacé, circuit purgé, essais OK.', t1, 5, { partsCost: 48500, interventionType: 'HYDRAULIQUE' });
    await corrective(at(-45, 6, 50), dem, MAT504, 'Caillou bloqué dans les tapis intérieur et extérieur.', { safety: false, regulatory: false, production: 'ARRET' }, 'INDISPONIBLE', 0.3, 'Caillou retiré, tapis contrôlés, redémarrage OK.', t2, 1);
    await corrective(at(-33, 10), dem, VL474, 'Enfoncement porte arrière gauche côté chauffeur.', { safety: false, regulatory: false, production: 'CONFORT' }, 'OPERATIONNEL', 240, 'Porte redressée et repeinte par le carrossier.', t1, 6, { resourceType: 'EXTERNE', externalProvider: 'Carrosserie (prestataire)', externalCost: 86000 });
    await corrective(at(-21, 6, 30), resp, EN512, 'Batterie à plat au démarrage, démarrage difficile.', { safety: false, regulatory: false, production: 'DEGRADE' }, 'DEGRADE', 2, 'Batterie remplacée, alternateur contrôlé (charge OK).', t3, 1.5, { partsCost: 32000, interventionType: 'ELECTRICITE' });
    await corrective(at(-12, 14), dem, PL210, "Voyant pression d'huile allumé par intermittence.", { safety: true, regulatory: false, production: 'DEGRADE' }, 'INDISPONIBLE', 18, 'Mano-contact de pression d’huile remplacé, pression contrôlée OK.', t2, 2.5, { partsCost: 12500, interventionType: 'ELECTRICITE' });
    // ── Situation actuelle ──
    const wd = (n) => workdayOffset(now, n);
    // En attente de pièce
    {
        const r = await run(dem, at(-9, 8), 'REQUEST_CREATE', { assetId: PL215, description: 'Perte de puissance, fumée noire à l’accélération.', impact: { safety: false, regulatory: false, production: 'ARRET' }, declaredState: 'INDISPONIBLE' });
        const ap = await run(resp, at(-9, 9), 'REQUEST_APPROVE', { id: r.id, interventionType: 'MECANIQUE' });
        await run(resp, at(-9, 9, 30), 'WO_PLAN', { id: ap.workOrderId, assigneeIds: [t2.id], plannedStart: at(-8, 7).toISOString(), plannedEnd: at(-8, 11).toISOString() });
        await run(t2, at(-8, 7), 'WO_START', { id: ap.workOrderId, safetyAnswers: await safety() });
        await run(resp, at(-8, 11), 'WO_HOLD', { id: ap.workOrderId, reason: 'Turbo HS : pièce commandée par avion, délai environ 1 mois.' });
    }
    // En cours : changement d'un vérin sur la grue
    {
        const wo = await run(resp, at(-3, 8), 'WO_CREATE', { assetId: IF301, title: 'Remplacement vérin de flèche', priority: 'P2', interventionType: 'HYDRAULIQUE', estimatedHours: 12, procedure: 'Chantier à risque : Take 5 sur place avec le responsable. Moyen de levage auxiliaire obligatoire.' });
        await run(resp, at(-3, 9), 'WO_PLAN', { id: wo.id, assigneeIds: [t1.id], plannedStart: at(-2, 7).toISOString(), plannedEnd: at(wd(1), 15).toISOString() });
        await run(t1, at(-2, 7, 15), 'WO_START', { id: wo.id, safetyAnswers: await safety(), immobilize: true });
    }
    // DI à approuver
    await run(dem, at(-1, 15, 20), 'REQUEST_CREATE', { assetId: EN520, description: 'Chenille droite détendue, bruit anormal en translation.', impact: { safety: false, regulatory: false, production: 'DEGRADE' }, declaredState: 'DEGRADE', photos: [] });
    await run(dem, at(0, 7, 5), 'REQUEST_CREATE', { assetId: VL474, description: 'Rétroviseur droit cassé.', impact: { safety: false, regulatory: true, production: 'AUCUN' }, declaredState: 'OPERATIONNEL' });
    // DI approuvée, BT à planifier
    {
        const r = await run(dem, at(-1, 10), 'REQUEST_CREATE', { assetId: EN486, description: 'Phare avant gauche HS.', impact: { safety: true, regulatory: false, production: 'AUCUN' }, declaredState: 'DEGRADE' });
        await run(resp, at(-1, 11), 'REQUEST_APPROVE', { id: r.id, interventionType: 'ELECTRICITE', title: 'Remplacer phare avant gauche' });
    }
    // BT planifiés cette semaine
    const planNew = async (assetId, title, tech, workday, h1, h2, extra = {}) => {
        const wo = await run(resp, at(-2, 10), 'WO_CREATE', { assetId, title, priority: extra.priority || 'P3', interventionType: extra.interventionType || 'MECANIQUE', estimatedHours: h2 - h1 });
        await run(resp, at(-2, 11), 'WO_PLAN', { id: wo.id, assigneeIds: tech.map(t => t.id), plannedStart: at(wd(workday), h1).toISOString(), plannedEnd: at(wd(workday), h2).toISOString() });
    };
    await planNew(BEN031, 'Ressouder renfort de porte', [t3], 1, 8, 11, { interventionType: 'STRUCTURE' });
    await planNew(RE012, 'Contrôle freinage et éclairage remorque', [t2], 2, 13, 15, { interventionType: 'ELECTRICITE' });
    await planNew(MAT504, 'Remplacer 2 rouleaux convoyeur intérieur', [t2, t3], 3, 7, 10);
    // Préventifs ouverts : on en planifie une partie dans la semaine
    const openPm = (await store.list(model_1.COLL.workOrders)).filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const slots = [[t3, 2, 7], [t1, 4, 13], [t2, 0, 13]];
    for (let i = 0; i < Math.min(1, openPm.length); i++) {
        const [tech, day, hour] = slots[i];
        await run(resp, at(-1, 10), 'WO_PLAN', { id: openPm[i].id, assigneeIds: [tech.id], plannedStart: at(wd(day), hour).toISOString(), plannedEnd: at(wd(day), hour + Math.ceil(openPm[i].estimatedHours || 2)).toISOString() });
    }
    // Tâches et absences
    const task = async (p) => run(resp, at(-2, 9), 'TASK_SAVE', p);
    await task({ title: 'Point maintenance hebdomadaire', kind: 'REUNION', assigneeIds: [t1.id, t2.id, t3.id, resp.id], start: at(wd(0), 6, 45).toISOString(), end: at(wd(0), 7, 15).toISOString() });
    await task({ title: 'Tournée graissage engins Gadji', kind: 'TACHE', assigneeIds: [t3.id], siteId: gadji, start: at(wd(0), 7, 30).toISOString(), end: at(wd(0), 11, 30).toISOString() });
    await task({ title: 'Réception de pièces au dock', kind: 'TACHE', assigneeIds: [t3.id], siteId: ducos, start: at(wd(3), 13).toISOString(), end: at(wd(3), 15).toISOString() });
    await task({ title: 'Formation habilitation électrique', kind: 'FORMATION', assigneeIds: [t2.id], start: at(wd(1), 7).toISOString(), end: at(wd(1), 16).toISOString() });
    await task({ title: 'Congé', kind: 'CONGE', assigneeIds: [t1.id], start: at(wd(4), 6).toISOString(), end: at(wd(4), 16).toISOString() });
}
//# sourceMappingURL=seed.js.map