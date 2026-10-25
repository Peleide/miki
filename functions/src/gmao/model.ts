// Modèle de données GMAO Miki (multi-entreprises).
// Fichier partagé : importé par les Cloud Functions ET par le front (mode démo inclus).
// Ne doit dépendre d'aucune librairie (ni firebase-admin, ni React).

export type GmaoRole = 'RESPONSABLE' | 'TECHNICIEN' | 'CLIENT';

// Correspondance avec les rôles Miki existants
export const ROLE_FROM_MIKI: Record<string, GmaoRole> = {
  ADMIN: 'RESPONSABLE',
  TECHNICIAN: 'RESPONSABLE',
  AGENT: 'TECHNICIEN',
  CLIENT: 'CLIENT',
};
export const MIKI_FROM_ROLE: Record<GmaoRole, string> = { RESPONSABLE: 'TECHNICIAN', TECHNICIEN: 'AGENT', CLIENT: 'CLIENT' };

export const ROLE_LABEL: Record<GmaoRole, string> = {
  RESPONSABLE: 'Responsable maintenance',
  TECHNICIEN: 'Technicien',
  CLIENT: 'Client',
};

// ─── Offres ──────────────────────────────────────────────────────────────────

export type PlanTier = 'STARTER' | 'PRO' | 'ULTRA' | 'SUR_MESURE';

export interface TenantPlan {
  tier: PlanTier;
  maxTechnicians: number;
  maxAssets: number;        // machines actives (niveau équipement, hors archives)
  maxClients: number;       // organisations clientes actives
  maxManagers: number;      // comptes responsable maintenance
}

export const PLANS: Record<PlanTier, TenantPlan & { label: string; priceXpf: number | null }> = {
  STARTER: { tier: 'STARTER', label: 'Starter', maxTechnicians: 1, maxAssets: 20, maxClients: 1, maxManagers: 1, priceXpf: 125000 },
  PRO: { tier: 'PRO', label: 'Pro', maxTechnicians: 3, maxAssets: 60, maxClients: 5, maxManagers: 1, priceXpf: 360000 },
  ULTRA: { tier: 'ULTRA', label: 'Ultra', maxTechnicians: 6, maxAssets: 200, maxClients: 10, maxManagers: 1, priceXpf: 600000 },
  SUR_MESURE: { tier: 'SUR_MESURE', label: 'Sur mesure', maxTechnicians: 50, maxAssets: 5000, maxClients: 200, maxManagers: 10, priceXpf: null },
};
export const planOf = (tier: PlanTier): TenantPlan => {
  const { label, priceXpf, ...plan } = PLANS[tier];
  return plan;
};

// ─── Référentiels propres à chaque organisation ─────────────────────────────

export type MeterType = 'HEURES' | 'KM';
export const METER_UNIT: Record<MeterType, string> = { HEURES: 'h', KM: 'km' };
export const METER_LABEL: Record<MeterType, string> = { HEURES: 'Horamètre (h)', KM: 'Kilométrage (km)' };

export interface Typology {
  id: string;
  name: string;                  // Autolaveuse, Véhicule léger, Centrale de dilution…
  meterType: MeterType | null;   // compteur proposé par défaut
  defaultChecklistId?: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface GmaoClient {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isArchived: boolean;
  createdAt: string;
}

export interface GmaoSite {
  id: string;
  name: string;
  address?: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export const DEFAULT_INTERVENTION_TYPES = ['Mécanique', 'Électrique', 'Hydraulique', 'Nettoyage', 'Contrôle', 'Autre'];

// ─── Machines ────────────────────────────────────────────────────────────────

export type AssetLevel = 'EQUIPEMENT' | 'SOUS_EQUIPEMENT' | 'COMPOSANT';
export type AssetState = 'OPERATIONNEL' | 'DEGRADE' | 'INDISPONIBLE';

export const LEVEL_LABEL: Record<AssetLevel, string> = {
  EQUIPEMENT: 'Machine',
  SOUS_EQUIPEMENT: 'Sous-ensemble',
  COMPOSANT: 'Composant',
};

export const STATE_LABEL: Record<AssetState, string> = {
  OPERATIONNEL: 'Opérationnelle',
  DEGRADE: 'Mode dégradé',
  INDISPONIBLE: 'À l’arrêt',
};

export interface AssetDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  uploadedByName: string;
}

/** Prochaine échéance préventive (copie dénormalisée, lisible par les clients). */
export interface NextPm {
  planId: string;
  planName: string;
  dueAt?: string | null;
  dueMeter?: number | null;
  overdue?: boolean;
}

export interface Asset {
  id: string;
  code: string;                 // généré (MAC-0001) ou propre à l'entreprise
  name: string;
  level: AssetLevel;
  parentId: string | null;
  typologyId: string | null;
  siteId: string;
  location?: string;
  clientId: string | null;      // organisation cliente propriétaire / bénéficiaire
  technicianIds: string[];      // périmètre : vide = tous les techniciens
  brand?: string;
  model?: string;
  serialNumber?: string;
  registration?: string;        // immatriculation
  commissioningDate?: string;
  contactName?: string;         // référent / utilisateur à prévenir (RDV garage…)
  contactPhone?: string;
  state: AssetState;
  stateReason?: string | null;
  stateSince: string;
  meterType?: MeterType | null;
  meterValue?: number | null;
  meterUpdatedAt?: string | null;
  documents: AssetDocument[];
  qrToken: string;              // jeton non devinable porté par l'URL du QR code
  nextPm?: NextPm | null;
  lastMaintenanceAt?: string | null;
  notes?: string;
  isArchived: boolean;
  createdAt: string;
}

export interface AssetEvent {
  id: string;
  assetId: string;
  clientId?: string | null;
  type: 'STATE' | 'METER';
  at: string;
  byId: string;
  byName: string;
  fromState?: AssetState;
  toState?: AssetState;
  reason?: string | null;
  value?: number;
  workOrderId?: string | null;
}

// ─── Priorités ───────────────────────────────────────────────────────────────

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const PRIORITY_WORD: Record<Priority, string> = { P1: 'Urgente', P2: 'Haute', P3: 'Normale', P4: 'Basse' };
export const DEFAULT_PRIORITY_DELAYS: Record<Priority, number> = { P1: 1, P2: 7, P3: 14, P4: 30 };

export function delayLabel(days: number): string {
  if (days <= 1) return 'dans la journée';
  if (days % 7 === 0) return days === 7 ? 'sous 1 semaine' : `sous ${days / 7} semaines`;
  if (days === 30 || days === 31) return 'dans le mois';
  return `sous ${days} jours`;
}
export const priorityLabel = (p: Priority, delays: Record<Priority, number> = DEFAULT_PRIORITY_DELAYS) => `${PRIORITY_WORD[p]} · ${delayLabel(delays[p] ?? DEFAULT_PRIORITY_DELAYS[p])}`;

// ─── Signalements ────────────────────────────────────────────────────────────

export type RequestKind = 'PROBLEME' | 'REMARQUE';
export type RequestSource = 'APP' | 'QR_PUBLIC';
export type RequestStatus = 'A_TRAITER' | 'APPROUVEE' | 'PLANIFIEE' | 'CLOTUREE' | 'ANNULEE';
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  A_TRAITER: 'À traiter',
  APPROUVEE: 'Intervention créée',
  PLANIFIEE: 'Planifiée',
  CLOTUREE: 'Traité',
  ANNULEE: 'Classé sans suite',
};
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ['A_TRAITER', 'APPROUVEE', 'PLANIFIEE'];

export interface WorkRequest {
  id: string;
  number: string;               // SIG-2026-0001
  kind: RequestKind;
  source: RequestSource;
  assetId: string;
  assetCode: string;
  assetName: string;
  siteId: string;
  clientId: string | null;
  description: string;
  photos: string[];
  requesterId: string | null;   // null : signalement anonyme par QR code
  requesterName: string;
  requesterContact?: string | null;
  createdAt: string;
  safety: boolean;
  declaredState: AssetState;
  suggestedPriority: Priority;
  priority: Priority;
  dueDate: string;
  status: RequestStatus;
  workOrderId?: string | null;
  decisionById?: string | null;
  decisionByName?: string | null;
  decisionAt?: string | null;
  cancelReason?: string | null;
  falseReport?: boolean;
}

// ─── Interventions ───────────────────────────────────────────────────────────

export type WorkOrderKind = 'CORRECTIF' | 'PREVENTIF';
export const KIND_LABEL: Record<WorkOrderKind, string> = { CORRECTIF: 'Curatif', PREVENTIF: 'Préventif' };
export type WorkOrderStatus = 'A_PLANIFIER' | 'PLANIFIE' | 'EN_COURS' | 'EN_ATTENTE' | 'CLOTURE' | 'ANNULE';
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  A_PLANIFIER: 'À planifier',
  PLANIFIE: 'Planifiée',
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  CLOTURE: 'Réalisée',
  ANNULE: 'Annulée',
};
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'];

export type ChecklistAnswers = Record<string, { value: any; note?: string }>;

export interface WorkOrder {
  id: string;
  number: string;               // INT-2026-0001
  kind: WorkOrderKind;
  workRequestId?: string | null;
  pmPlanId?: string | null;
  generatedAutomatically?: boolean;
  assetId: string;
  assetCode: string;
  assetName: string;
  siteId: string;
  clientId: string | null;
  typologyId: string | null;
  title: string;
  description?: string;
  priority: Priority;
  dueDate: string;
  interventionType: string;
  procedure?: string;
  checklistId?: string | null;
  safetyCheckRequired: boolean;
  estimatedHours?: number | null;
  resourceType: 'INTERNE' | 'EXTERNE';
  assigneeIds: string[];
  assigneeNames: string[];
  externalProvider?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  status: WorkOrderStatus;
  holdReason?: string | null;
  cancelReason?: string | null;
  startedAt?: string | null;
  startedByName?: string | null;
  safetyAnswers?: ChecklistAnswers | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  report?: string | null;
  checklistAnswers?: ChecklistAnswers | null;
  photos?: string[];
  meterAtClose?: number | null;
  assetStateAfter?: AssetState | null;
  closedAt?: string | null;
  closedById?: string | null;
  closedByName?: string | null;
  createdAt: string;
  createdById: string;
  createdByName: string;
}

// ─── Préventif ───────────────────────────────────────────────────────────────

export type PmTrigger = 'CALENDAIRE' | 'COMPTEUR';
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** Récurrence calendaire, sur le modèle des rendez-vous récurrents de Google Agenda. */
export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;                         // tous les N jours / semaines / mois / ans
  byWeekday?: number[];                     // hebdomadaire : 0 = lundi … 6 = dimanche
  monthlyMode?: 'DAY' | 'NTH_WEEKDAY';      // mensuel : le 15 du mois / le 2e mardi
  end: { type: 'NEVER' | 'UNTIL' | 'COUNT'; until?: string | null; count?: number | null };
  /** CALENDRIER : dates fixes, une réalisation en retard ne décale pas la suite.
   *  REALISATION : l'intervalle repart de la date réelle de réalisation. */
  anchor: 'CALENDRIER' | 'REALISATION';
}

export interface PmScheduleEntry {
  startDate?: string | null;     // première occurrence (AAAA-MM-JJ, heure locale)
  startMeter?: number | null;    // compteur : base de la série (mode fixe)
  doneCount?: number;
  lastDoneAt?: string | null;
  lastDoneMeter?: number | null;
  nextDueAt?: string | null;     // ISO
  nextDueMeter?: number | null;
  openWorkOrderId?: string | null;
  ended?: boolean;
}

export interface PmPlan {
  id: string;
  name: string;
  typologyId?: string | null;     // gamme type : appliquée aux nouvelles machines de la typologie
  assetIds: string[];
  trigger: PmTrigger;
  recurrence?: Recurrence | null; // CALENDAIRE
  meterInterval?: number | null;  // COMPTEUR : tous les N km / h
  meterAnchor?: 'REALISATION' | 'FIXE';
  alertBefore: number;            // jours (calendaire) ou unités compteur
  interventionType: string;
  priority: Priority;
  procedure?: string;
  checklistId?: string | null;
  consumables?: string;
  estimatedHours?: number | null;
  safetyCheckRequired: boolean;
  isActive: boolean;
  isArchived: boolean;
  schedule: Record<string, PmScheduleEntry>;
  createdAt: string;
}

// ─── Planning ────────────────────────────────────────────────────────────────

export type TaskKind = 'TACHE' | 'CONGE' | 'FORMATION' | 'ABSENCE' | 'REUNION';
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  TACHE: 'Tâche',
  CONGE: 'Congé',
  FORMATION: 'Formation',
  ABSENCE: 'Absence',
  REUNION: 'Réunion',
};

export interface CalendarTask {
  id: string;
  title: string;
  kind: TaskKind;
  assigneeIds: string[];
  assigneeNames: string[];
  siteId?: string | null;
  assetId?: string | null;
  start: string;
  end: string;
  notes?: string;
  status: 'A_FAIRE' | 'FAIT';
  doneAt?: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

// ─── Check-lists ─────────────────────────────────────────────────────────────

export type ChecklistItemType = 'BOOLEAN' | 'CHOICE' | 'TEXT' | 'NUMBER' | 'PHOTO';
export interface GmaoChecklistItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required: boolean;
  options?: string[];            // CHOICE
}
export interface GmaoChecklist {
  id: string;
  name: string;
  kind: 'MAINTENANCE' | 'SECURITE';
  description?: string;
  items: GmaoChecklistItem[];
  isArchived: boolean;
  // compatibilité avec le modèle Miki existant
  triggerType?: string;
  targetContext?: string;
}

// ─── Réglages de l'organisation ─────────────────────────────────────────────

export interface GmaoSettings {
  requireApproval: boolean;          // les signalements passent par le responsable
  techniciansSelfPlan: boolean;      // les techniciens gèrent eux-mêmes leur planning
  publicReports: boolean;            // formulaire public au scan du QR code
  assetHierarchy: boolean;           // sous-ensembles et composants
  safetyChecklistId?: string | null; // analyse de sécurité avant intervention (null = désactivée)
  assetCodeMode: 'GENERATED' | 'MANUAL';
  assetCodePrefix: string;
  priorityDelays: Record<Priority, number>;
  interventionTypes: string[];
  utcOffsetMinutes: number;          // Nouméa : +660, pas d'heure d'été
}

export const DEFAULT_SETTINGS: GmaoSettings = {
  requireApproval: false,
  techniciansSelfPlan: false,
  publicReports: true,
  assetHierarchy: false,
  safetyChecklistId: null,
  assetCodeMode: 'GENERATED',
  assetCodePrefix: 'MAC',
  priorityDelays: { ...DEFAULT_PRIORITY_DELAYS },
  interventionTypes: [...DEFAULT_INTERVENTION_TYPES],
  utcOffsetMinutes: 660,
};

export function withDefaults(s: Partial<GmaoSettings> | undefined | null): GmaoSettings {
  const v = { ...DEFAULT_SETTINGS, ...(s || {}) };
  v.priorityDelays = { ...DEFAULT_PRIORITY_DELAYS, ...(s?.priorityDelays || {}) };
  v.interventionTypes = Array.isArray(s?.interventionTypes) && s!.interventionTypes.length ? s!.interventionTypes : [...DEFAULT_INTERVENTION_TYPES];
  return v;
}

export interface GmaoUser {
  id: string;
  name: string;
  role: GmaoRole;
  clientId?: string | null;
}

export interface GmaoNotification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  read: boolean;
  timestamp: string;
}

// ─── Collections (sous tenants/{tenantId}) ───────────────────────────────────

export const COLL = {
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
} as const;
export type CollName = typeof COLL[keyof typeof COLL];

/** Collections qu'un compte client peut lire (filtrées sur son clientId). */
export const CLIENT_SCOPED: CollName[] = [COLL.assets, COLL.assetEvents, COLL.requests, COLL.workOrders];
/** Collections de référence lisibles par tous les membres. */
export const SHARED_COLLS: CollName[] = [COLL.typologies, COLL.checklists, COLL.sites];

/** Chemin de l'URL portée par le QR code d'une machine. */
export const qrPath = (token: string) => `/q/${token}`;
export function tokenFromScan(text: string): string | null {
  const m = String(text || '').trim().match(/\/q\/([A-Za-z0-9_-]{8,64})/);
  return m ? m[1] : null;
}
