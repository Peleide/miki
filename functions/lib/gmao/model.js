"use strict";
// Modèle de données GMAO (branche CSP).
// Fichier partagé : importé par les Cloud Functions ET par le front (mode démo inclus).
// Ne doit dépendre d'aucune librairie (ni firebase-admin, ni React).
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLL = exports.DEFAULT_SETTINGS = exports.TASK_KIND_LABEL = exports.CALENDAR_UNIT_LABEL = exports.OPEN_WORK_ORDER_STATUSES = exports.WORK_ORDER_STATUS_LABEL = exports.REQUEST_STATUS_LABEL = exports.PRODUCTION_IMPACT_LABEL = exports.PRIORITY_LABEL = exports.PRIORITY_DELAY_DAYS = exports.PRIORITIES = exports.METER_UNIT = exports.STATE_LABEL = exports.LEVEL_LABEL = exports.INTERVENTION_TYPES = exports.COMPONENT_CATEGORIES = exports.COMPANIES = exports.FAMILIES = exports.ROLE_LABEL = exports.ROLE_FROM_MIKI = void 0;
// Correspondance avec les rôles Miki existants
exports.ROLE_FROM_MIKI = {
    ADMIN: 'RESPONSABLE',
    TECHNICIAN: 'RESPONSABLE',
    AGENT: 'TECHNICIEN',
    CLIENT: 'DEMANDEUR',
};
exports.ROLE_LABEL = {
    RESPONSABLE: 'Responsable maintenance',
    TECHNICIEN: 'Technicien',
    DEMANDEUR: 'Demandeur',
};
// ─── Référentiels ────────────────────────────────────────────────────────────
exports.FAMILIES = [
    { code: 'EN', label: 'Engins mobiles' },
    { code: 'BEN', label: 'Bennes' },
    { code: 'VL', label: 'Véhicules légers' },
    { code: 'RE', label: 'Remorques' },
    { code: 'PL', label: 'Poids lourds' },
    { code: 'IF', label: 'Installations fixes et outillage' },
    { code: 'QAV', label: "Quais d'apport volontaire" },
];
exports.COMPANIES = ['CSP', 'SAMERTOWN', 'CDV'];
exports.COMPONENT_CATEGORIES = [
    { code: 'ELECTRIQUE', label: 'Électrique' },
    { code: 'MECANIQUE', label: 'Mécanique' },
    { code: 'HYDRAULIQUE', label: 'Hydraulique' },
    { code: 'PNEUMATIQUE', label: 'Pneumatique' },
    { code: 'AUTOMATISME', label: 'Systèmes / automatismes' },
    { code: 'COMMUNICATION', label: 'Communication' },
];
exports.INTERVENTION_TYPES = [
    { code: 'MECANIQUE', label: 'Mécanique' },
    { code: 'HYDRAULIQUE', label: 'Hydraulique' },
    { code: 'PNEUMATIQUE', label: 'Pneumatique' },
    { code: 'ELECTRICITE', label: 'Électricité' },
    { code: 'CONTROLE_COMMANDE', label: 'Contrôle commande (automatismes)' },
    { code: 'INSTRUMENTATION', label: 'Instrumentation' },
    { code: 'STRUCTURE', label: 'Structure' },
    { code: 'INFORMATIQUE', label: 'Informatique industrielle / réseaux' },
];
exports.LEVEL_LABEL = {
    EQUIPEMENT: 'Équipement',
    SOUS_EQUIPEMENT: 'Sous-équipement',
    COMPOSANT: 'Composant',
};
exports.STATE_LABEL = {
    OPERATIONNEL: 'Opérationnel',
    DEGRADE: 'Mode dégradé',
    INDISPONIBLE: 'Indisponible',
};
exports.METER_UNIT = { HEURES: 'h', KM: 'km' };
exports.PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
exports.PRIORITY_DELAY_DAYS = { P1: 1, P2: 7, P3: 14, P4: 30 };
exports.PRIORITY_LABEL = {
    P1: 'P1 · dans la journée',
    P2: 'P2 · dans la semaine',
    P3: 'P3 · sous 2 semaines',
    P4: 'P4 · dans le mois',
};
exports.PRODUCTION_IMPACT_LABEL = {
    ARRET: "Bloque l'exploitation",
    DEGRADE: "Ralentit l'exploitation",
    AUCUN: "Pas d'impact immédiat",
    CONFORT: 'Gêne mineure / amélioration',
};
exports.REQUEST_STATUS_LABEL = {
    A_APPROUVER: 'À approuver',
    APPROUVEE: 'Approuvée',
    PLANIFIEE: 'Planifiée',
    CLOTUREE: 'Clôturée',
    ANNULEE: 'Annulée',
};
exports.WORK_ORDER_STATUS_LABEL = {
    A_PLANIFIER: 'À planifier',
    PLANIFIE: 'Planifié',
    EN_COURS: 'En cours',
    EN_ATTENTE: 'En attente',
    CLOTURE: 'Clôturé',
    ANNULE: 'Annulé',
};
exports.OPEN_WORK_ORDER_STATUSES = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'];
exports.CALENDAR_UNIT_LABEL = { JOURS: 'jour(s)', SEMAINES: 'semaine(s)', MOIS: 'mois' };
exports.TASK_KIND_LABEL = {
    TACHE: 'Tâche',
    CONGE: 'Congé',
    FORMATION: 'Formation',
    ABSENCE: 'Absence',
    REUNION: 'Réunion',
};
exports.DEFAULT_SETTINGS = { hourlyRate: 0, safetyChecklistId: null };
// ─── Collections (sous tenants/{tenantId}) ───────────────────────────────────
exports.COLL = {
    assets: 'gmaoAssets',
    assetEvents: 'gmaoAssetEvents',
    requests: 'gmaoRequests',
    workOrders: 'gmaoWorkOrders',
    pmPlans: 'gmaoPmPlans',
    tasks: 'gmaoTasks',
    checklists: 'checklists',
    sites: 'sites',
};
//# sourceMappingURL=model.js.map