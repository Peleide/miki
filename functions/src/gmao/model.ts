// Modèle de données GMAO (branche CSP).
// Fichier partagé : importé par les Cloud Functions ET par le front (mode démo inclus).
// Ne doit dépendre d'aucune librairie (ni firebase-admin, ni React).

export type GmaoRole = 'RESPONSABLE' | 'TECHNICIEN' | 'DEMANDEUR';

// Correspondance avec les rôles Miki existants
export const ROLE_FROM_MIKI: Record<string, GmaoRole> = {
  ADMIN: 'RESPONSABLE',
  TECHNICIAN: 'RESPONSABLE',
  AGENT: 'TECHNICIEN',
  CLIENT: 'DEMANDEUR',
};

export const ROLE_LABEL: Record<GmaoRole, string> = {
  RESPONSABLE: 'Responsable maintenance',
  TECHNICIEN: 'Technicien',
  DEMANDEUR: 'Demandeur',
};

// ─── Référentiels ────────────────────────────────────────────────────────────

export const FAMILIES = [
  { code: 'EN', label: 'Engins mobiles' },
  { code: 'BEN', label: 'Bennes' },
  { code: 'VL', label: 'Véhicules légers' },
  { code: 'RE', label: 'Remorques' },
  { code: 'PL', label: 'Poids lourds' },
  { code: 'IF', label: 'Installations fixes et outillage' },
  { code: 'QAV', label: "Quais d'apport volontaire" },
] as const;
export type FamilyCode = typeof FAMILIES[number]['code'];

export const COMPANIES = ['CSP', 'SAMERTOWN', 'CDV'] as const;
export type Company = typeof COMPANIES[number];

export const COMPONENT_CATEGORIES = [
  { code: 'ELECTRIQUE', label: 'Électrique' },
  { code: 'MECANIQUE', label: 'Mécanique' },
  { code: 'HYDRAULIQUE', label: 'Hydraulique' },
  { code: 'PNEUMATIQUE', label: 'Pneumatique' },
  { code: 'AUTOMATISME', label: 'Systèmes / automatismes' },
  { code: 'COMMUNICATION', label: 'Communication' },
] as const;
export type ComponentCategory = typeof COMPONENT_CATEGORIES[number]['code'];

export const INTERVENTION_TYPES = [
  { code: 'MECANIQUE', label: 'Mécanique' },
  { code: 'HYDRAULIQUE', label: 'Hydraulique' },
  { code: 'PNEUMATIQUE', label: 'Pneumatique' },
  { code: 'ELECTRICITE', label: 'Électricité' },
  { code: 'CONTROLE_COMMANDE', label: 'Contrôle commande (automatismes)' },
  { code: 'INSTRUMENTATION', label: 'Instrumentation' },
  { code: 'STRUCTURE', label: 'Structure' },
  { code: 'INFORMATIQUE', label: 'Informatique industrielle / réseaux' },
] as const;
export type InterventionType = typeof INTERVENTION_TYPES[number]['code'];

// ─── Équipements ─────────────────────────────────────────────────────────────

export type AssetLevel = 'EQUIPEMENT' | 'SOUS_EQUIPEMENT' | 'COMPOSANT';
export type AssetState = 'OPERATIONNEL' | 'DEGRADE' | 'INDISPONIBLE';
export type MeterType = 'HEURES' | 'KM';

export const LEVEL_LABEL: Record<AssetLevel, string> = {
  EQUIPEMENT: 'Équipement',
  SOUS_EQUIPEMENT: 'Sous-équipement',
  COMPOSANT: 'Composant',
};

export const STATE_LABEL: Record<AssetState, string> = {
  OPERATIONNEL: 'Opérationnel',
  DEGRADE: 'Mode dégradé',
  INDISPONIBLE: 'Indisponible',
};

export const METER_UNIT: Record<MeterType, string> = { HEURES: 'h', KM: 'km' };

export interface AssetDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  uploadedByName: string;
}

export interface Asset {
  id: string;
  code: string;                 // ex. EN486
  name: string;                 // ex. Chargeuse Liebherr L550
  level: AssetLevel;
  parentId: string | null;
  family: FamilyCode;
  componentCategory?: ComponentCategory | null;
  siteId: string;
  location?: string;
  company: Company;
  brand?: string;
  model?: string;
  serialNumber?: string;
  registration?: string;        // immatriculation
  commissioningDate?: string;
  state: AssetState;
  stateReason?: string | null;
  stateSince: string;
  meterType?: MeterType | null;
  meterValue?: number | null;
  meterUpdatedAt?: string | null;
  documents: AssetDocument[];
  qrCode: string;
  notes?: string;
  isArchived: boolean;
  createdAt: string;
}

export interface AssetEvent {
  id: string;
  assetId: string;
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

export interface GmaoSite {
  id: string;
  name: string;
  address?: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

// ─── Demandes d'intervention (DI) ────────────────────────────────────────────

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const PRIORITY_DELAY_DAYS: Record<Priority, number> = { P1: 1, P2: 7, P3: 14, P4: 30 };
export const PRIORITY_LABEL: Record<Priority, string> = {
  P1: 'P1 · dans la journée',
  P2: 'P2 · dans la semaine',
  P3: 'P3 · sous 2 semaines',
  P4: 'P4 · dans le mois',
};

export type ProductionImpact = 'ARRET' | 'DEGRADE' | 'AUCUN' | 'CONFORT';
export const PRODUCTION_IMPACT_LABEL: Record<ProductionImpact, string> = {
  ARRET: "Bloque l'exploitation",
  DEGRADE: "Ralentit l'exploitation",
  AUCUN: "Pas d'impact immédiat",
  CONFORT: 'Gêne mineure / amélioration',
};

export interface Impact {
  safety: boolean;
  regulatory: boolean;
  production: ProductionImpact;
}

export type RequestStatus = 'A_APPROUVER' | 'APPROUVEE' | 'PLANIFIEE' | 'CLOTUREE' | 'ANNULEE';
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  A_APPROUVER: 'À approuver',
  APPROUVEE: 'Approuvée',
  PLANIFIEE: 'Planifiée',
  CLOTUREE: 'Clôturée',
  ANNULEE: 'Annulée',
};

export interface WorkRequest {
  id: string;
  number: string;               // DI-2026-0001
  assetId: string;
  assetCode: string;
  assetName: string;
  siteId: string;
  description: string;
  photos: string[];
  requesterId: string;
  requesterName: string;
  createdAt: string;
  impact: Impact;
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
}

// ─── Bons de travail (BT) ────────────────────────────────────────────────────

export type WorkOrderKind = 'CORRECTIF' | 'PREVENTIF';
export type WorkOrderStatus = 'A_PLANIFIER' | 'PLANIFIE' | 'EN_COURS' | 'EN_ATTENTE' | 'CLOTURE' | 'ANNULE';
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  A_PLANIFIER: 'À planifier',
  PLANIFIE: 'Planifié',
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  CLOTURE: 'Clôturé',
  ANNULE: 'Annulé',
};
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ['A_PLANIFIER', 'PLANIFIE', 'EN_COURS', 'EN_ATTENTE'];

export type ChecklistAnswers = Record<string, { value: any; note?: string }>;

export interface WorkOrder {
  id: string;
  number: string;               // BT-2026-0001
  kind: WorkOrderKind;
  workRequestId?: string | null;
  pmPlanId?: string | null;
  generatedAutomatically?: boolean;
  assetId: string;
  assetCode: string;
  assetName: string;
  siteId: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate: string;
  interventionType: InterventionType;
  procedure?: string;           // mode opératoire
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
  laborHours?: number | null;
  partsCost?: number | null;
  externalCost?: number | null;
  meterAtClose?: number | null;
  assetStateAfter?: AssetState | null;
  closedAt?: string | null;
  closedById?: string | null;
  closedByName?: string | null;
  createdAt: string;
  createdById: string;
  createdByName: string;
}

// ─── Maintenance préventive (gammes) ─────────────────────────────────────────

export type PmTrigger = 'CALENDAIRE' | 'COMPTEUR';
export type CalendarUnit = 'JOURS' | 'SEMAINES' | 'MOIS';
export const CALENDAR_UNIT_LABEL: Record<CalendarUnit, string> = { JOURS: 'jour(s)', SEMAINES: 'semaine(s)', MOIS: 'mois' };

export interface PmScheduleEntry {
  lastDoneAt?: string | null;
  lastDoneMeter?: number | null;
  nextDueAt?: string | null;
  nextDueMeter?: number | null;
  openWorkOrderId?: string | null;
}

export interface PmPlan {
  id: string;
  name: string;
  assetIds: string[];
  trigger: PmTrigger;
  intervalValue: number;
  intervalUnit?: CalendarUnit;     // CALENDAIRE uniquement
  alertBefore: number;             // jours (calendaire) ou unités compteur
  interventionType: InterventionType;
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

export type ChecklistItemType = 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'PHOTO';
export interface GmaoChecklistItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required: boolean;
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

// ─── Réglages ────────────────────────────────────────────────────────────────

export interface GmaoSettings {
  hourlyRate: number;              // XPF / heure, main d'œuvre interne
  safetyChecklistId?: string | null;
}

export const DEFAULT_SETTINGS: GmaoSettings = { hourlyRate: 0, safetyChecklistId: null };

export interface GmaoUser {
  id: string;
  name: string;
  role: GmaoRole;
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
  checklists: 'checklists',
  sites: 'sites',
} as const;
export type CollName = typeof COLL[keyof typeof COLL];
