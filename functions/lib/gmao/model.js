"use strict";
// Modèle de données GMAO Miki (multi-entreprises).
// Fichier partagé : importé par les Cloud Functions ET par le front (mode démo inclus).
// Ne doit dépendre d'aucune librairie (ni firebase-admin, ni React).
Object.defineProperty(exports, "__esModule", { value: true });
exports.qrPath = exports.SHARED_COLLS = exports.CLIENT_SCOPED = exports.COLL = exports.DEFAULT_SETTINGS = exports.TASK_KIND_LABEL = exports.OPEN_WORK_ORDER_STATUSES = exports.WORK_ORDER_STATUS_LABEL = exports.KIND_LABEL = exports.OPEN_REQUEST_STATUSES = exports.REQUEST_STATUS_LABEL = exports.priorityLabel = exports.DEFAULT_PRIORITY_DELAYS = exports.PRIORITY_WORD = exports.PRIORITIES = exports.STATE_LABEL = exports.LEVEL_LABEL = exports.DEFAULT_INTERVENTION_TYPES = exports.METER_LABEL = exports.METER_UNIT = exports.planOf = exports.PLANS = exports.ROLE_LABEL = exports.MIKI_FROM_ROLE = exports.ROLE_FROM_MIKI = void 0;
exports.delayLabel = delayLabel;
exports.withDefaults = withDefaults;
exports.tokenFromScan = tokenFromScan;
// Correspondance avec les rôles Miki existants
exports.ROLE_FROM_MIKI = {
    ADMIN: 'RESPONSABLE',
    TECHNICIAN: 'RESPONSABLE',
    AGENT: 'TECHNICIEN',
    CLIENT: 'CLIENT',
};
exports.MIKI_FROM_ROLE = { RESPONSABLE: 'TECHNICIAN', TECHNICIEN: 'AGENT', CLIENT: 'CLIENT' };
exports.ROLE_LABEL = {
    RESPONSABLE: 'Responsable maintenance',
    TECHNICIEN: 'Technicien',
    CLIENT: 'Client',
};
exports.PLANS = {
    STARTER: { tier: 'STARTER', label: 'Starter', maxTechnicians: 1, maxAssets: 20, maxClients: 1, maxManagers: 1, priceXpf: 125000 },
    PRO: { tier: 'PRO', label: 'Pro', maxTechnicians: 3, maxAssets: 60, maxClients: 5, maxManagers: 1, priceXpf: 360000 },
    ULTRA: { tier: 'ULTRA', label: 'Ultra', maxTechnicians: 6, maxAssets: 200, maxClients: 10, maxManagers: 1, priceXpf: 600000 },
    SUR_MESURE: { tier: 'SUR_MESURE', label: 'Sur mesure', maxTechnicians: 50, maxAssets: 5000, maxClients: 200, maxManagers: 10, priceXpf: null },
};
const planOf = (tier) => {
    const { label, priceXpf, ...plan } = exports.PLANS[tier];
    return plan;
};
exports.planOf = planOf;
exports.METER_UNIT = { HEURES: 'h', KM: 'km' };
exports.METER_LABEL = { HEURES: 'Horamètre (h)', KM: 'Kilométrage (km)' };
exports.DEFAULT_INTERVENTION_TYPES = ['Mécanique', 'Électrique', 'Hydraulique', 'Nettoyage', 'Contrôle', 'Autre'];
exports.LEVEL_LABEL = {
    EQUIPEMENT: 'Machine',
    SOUS_EQUIPEMENT: 'Sous-ensemble',
    COMPOSANT: 'Composant',
};
exports.STATE_LABEL = {
    OPERATIONNEL: 'Opérationnelle',
    DEGRADE: 'Mode dégradé',
    INDISPONIBLE: 'À l’arrêt',
};
exports.PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
exports.PRIORITY_WORD = { P1: 'Urgente', P2: 'Haute', P3: 'Normale', P4: 'Basse' };
exports.DEFAULT_PRIORITY_DELAYS = { P1: 1, P2: 7, P3: 14, P4: 30 };
function delayLabel(days) {
    if (days <= 1)
        return 'dans la journée';
    if (days % 7 === 0)
        return days === 7 ? 'sous 1 semaine' : `sous ${days / 7} semaines`;
    if (days === 30 || days === 31)
        return 'dans le mois';
    return `sous ${days} jours`;
}
const priorityLabel = (p, delays = exports.DEFAULT_PRIORITY_DELAYS) => `${exports.PRIORITY_WORD[p]} · ${delayLabel(delays[p] ?? exports.DEFAULT_PRIORITY_DELAYS[p])}`;
exports.priorityLabel = priorityLabel;
exports.REQUEST_STATUS_LABEL = {
    A_TRAITER: 'À traiter',
    APPROUVEE: 'Intervention créée',
    PLANIFIEE: 'Planifiée',
    CLOTUREE: 'Traité',
    ANNULEE: 'Classé sans suite',
};
exports.OPEN_REQUEST_STATUSES = ['A_TRAITER', 'APPROUVEE', 'PLANIFIEE'];
exports.KIND_LABEL = { CORRECTIF: 'Curatif', PREVENTIF: 'Préventif' };
exports.WORK_ORDER_STATUS_LABEL = {
    A_PLANIFIER: 'À planifier',
    PLANIFIE: 'Planifiée',
    EN_COURS: 'En cours',
    EN_ATTENTE: 'En attente',
    CLOTURE: 'Réalisée',
    ANNULE: 'Annulée',
};
exports.OPEN_WORK_ORDER_STATUSES = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'];
exports.TASK_KIND_LABEL = {
    TACHE: 'Tâche',
    CONGE: 'Congé',
    FORMATION: 'Formation',
    ABSENCE: 'Absence',
    REUNION: 'Réunion',
};
exports.DEFAULT_SETTINGS = {
    requireApproval: false,
    techniciansSelfPlan: false,
    publicReports: true,
    assetHierarchy: false,
    safetyChecklistId: null,
    assetCodeMode: 'GENERATED',
    assetCodePrefix: 'MAC',
    priorityDelays: { ...exports.DEFAULT_PRIORITY_DELAYS },
    interventionTypes: [...exports.DEFAULT_INTERVENTION_TYPES],
    utcOffsetMinutes: 660,
};
function withDefaults(s) {
    const v = { ...exports.DEFAULT_SETTINGS, ...(s || {}) };
    v.priorityDelays = { ...exports.DEFAULT_PRIORITY_DELAYS, ...(s?.priorityDelays || {}) };
    v.interventionTypes = Array.isArray(s?.interventionTypes) && s.interventionTypes.length ? s.interventionTypes : [...exports.DEFAULT_INTERVENTION_TYPES];
    return v;
}
// ─── Collections (sous tenants/{tenantId}) ───────────────────────────────────
exports.COLL = {
    assets: 'gmaoAssets',
    assetEvents: 'gmaoAssetEvents',
    requests: 'gmaoRequests',
    workOrders: 'gmaoWorkOrders',
    pmPlans: 'gmaoPmPlans',
    tasks: 'gmaoTasks',
    typologies: 'gmaoTypologies',
    clients: 'gmaoClients',
    checklists: 'checklists',
    sites: 'sites',
};
/** Collections qu'un compte client peut lire (filtrées sur son clientId). */
exports.CLIENT_SCOPED = [exports.COLL.assets, exports.COLL.assetEvents, exports.COLL.requests, exports.COLL.workOrders];
/** Collections de référence lisibles par tous les membres. */
exports.SHARED_COLLS = [exports.COLL.typologies, exports.COLL.checklists, exports.COLL.sites];
/** Chemin de l'URL portée par le QR code d'une machine. */
const qrPath = (token) => `/q/${token}`;
exports.qrPath = qrPath;
function tokenFromScan(text) {
    const m = String(text || '').trim().match(/\/q\/([A-Za-z0-9_-]{8,64})/);
    return m ? m[1] : null;
}
//# sourceMappingURL=model.js.map