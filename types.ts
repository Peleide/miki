export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
  AGENT = 'AGENT',
  CLIENT = 'CLIENT',
}

export type EquipmentLogAction = 'TAKE' | 'RETURN' | 'REPORT' | 'INTERVENTION' | 'CREATE' | 'ARCHIVE';

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  address?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string;
}

export interface AppNotification {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  read: boolean;
  link?: string;
  timestamp: string;
}

export interface Tenant {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  logoUrl?: string;
  timezone: string;
  quotas: {
    equipments: number;
    users: number;
  };
  security?: {
    minCheckInDelaySeconds?: number;
    maxCheckInsPerWindow?: number;
    rateLimitWindowSeconds?: number;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  tenantId: string;
  tenantName: string;
  category: 'SECURITY' | 'STRUCTURE' | 'BILLING' | 'USER';
  serverTimestamp?: any;
}

// --- CENTRALES DE DILUTION & VISITES TECHNIQUES ---

/** État d'un composant lors d'une visite : ok = pas de remplacement, 1 = 1 remplacement, 2 = 2 remplacements */
export type ComponentState = 'ok' | 1 | 2;

/** Une unité CDil installée à un emplacement fixe dans l'établissement */
export interface CdilUnit {
  id: string;
  tenantId: string;
  serialNumber: string;        // identifiant constructeur ex. "4839", "11503", "Serial n. 06A01243A"
  location: string;            // localisation complète ex. "Oncologie B26"
  service: string;             // service hospitalier ex. "Oncologie"
  roomCode: string;            // code salle ex. "B26"
  isActive: boolean;
  createdAt: string;
  lastVisitDate?: string;
  currentState?: {
    buse: ComponentState;
    crepine: ComponentState;
    ligne: ComponentState;
  };
  notes?: string;
}

/** Une ligne d'une session de visite (un CDil visité) */
export interface VisitEntry {
  unitId: string;
  serialNumber: string;        // snapshot au moment de la visite
  location: string;            // snapshot
  service: string;             // snapshot
  buse: ComponentState;
  crepine: ComponentState;
  ligne: ComponentState;
  remarks?: string;
  photos?: string[];           // future: URLs Firebase Storage
}

/** Une session de visite technique (regroupe plusieurs unités visitées en une tournée) */
export interface VisitSession {
  id: string;
  tenantId: string;
  type: 'CDIL';                // extensible à d'autres types de visites
  sessionType: 'PERIODIQUE' | 'INTERVENTION'; // périodique (2/an, toutes unités) ou inopinée (sélection)
  title: string;               // ex. "Visite technique Mai 2026"
  date: string;                // date de la visite (ISO)
  technicianId: string;
  technicianName: string;      // snapshot
  status: 'DRAFT' | 'COMPLETED';
  createdAt: string;
  completedAt?: string;
  entries: VisitEntry[];       // unités visitées dans cette session
}

export interface DaySchedule {
  start: string;
  end: string;
  isOff: boolean;
}

export interface WeeklySchedule {
  mon: DaySchedule;
  tue: DaySchedule;
  wed: DaySchedule;
  thu: DaySchedule;
  fri: DaySchedule;
  sat: DaySchedule;
  sun: DaySchedule;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  
  // SESSION CONTEXT
  tenantId: string; 
  role: UserRole;
  
  // SERVER-SIDE SESSION LOCK
  activeSessionId?: string | null;
  activeEquipmentId?: string | null;
  
  // DB STORAGE
  tenantsAccess: { [tenantId: string]: UserRole };
  accessibleTenantIds: string[];
  assignedSiteIds?: string[];

  isArchived: boolean;
  isDisabled: boolean; 
  password?: string; 
  mustChangePassword?: boolean;

  // RATE LIMITING STATE
  lastCheckInTimestamp?: any; 
  rateLimit?: {
    count: number;
    windowStart: any; 
  };

  weeklySchedule?: WeeklySchedule;
}

export interface EquipmentType {
  id: string;
  tenantId?: string;
  name: string;    // "Autolaveuse"
  code: string;    // "AL"
  isDefault?: boolean;
  isArchived?: boolean;
}

export const DEFAULT_EQUIPMENT_TYPES: EquipmentType[] = [
  { id: 'default-tel',  name: 'Téléphone',             code: 'Tél',  isDefault: true },
  { id: 'default-al',   name: 'Autolaveuse',            code: 'AL',   isDefault: true },
  { id: 'default-mal',  name: 'Mini Autolaveuse',       code: 'MAL',  isDefault: true },
  { id: 'default-nv',   name: 'Nettoyeur Vapeur',       code: 'NV',   isDefault: true },
  { id: 'default-cha',  name: 'Chariot',                code: 'Cha',  isDefault: true },
  { id: 'default-v',    name: 'Voiture',                code: 'V',    isDefault: true },
  { id: 'default-cdil', name: 'Centrale de Dilution',   code: 'CDil', isDefault: true },
];

export interface Equipment {
  id: string;
  tenantId: string;

  // Category (new nomenclature system)
  category?: string;         // "Autolaveuse"
  categoryCode?: string;     // "AL"
  storageLocation?: string;  // Lieu de rangement fixe, ex: "Dépôt A"

  // Traceability dates (auto-updated from resolved tickets)
  lastVisiteTechniqueDate?: string;
  lastReparationDate?: string;
  createdAt?: string;

  // Legacy classification
  type: string;
  subType: string;
  brand: string;
  model: string;
  serialNumber?: string;
  uniqueId: string;    // N° de référence interne

  name: string;
  qrCode: string;
  instructions?: string;

  // Equipment Status Management
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'ARCHIVED';

  // Batch Management (Petit Matériel)
  isBatch: boolean;
  batchQuantity?: number;  // stock actuellement disponible
  batchTotal?: number;     // quantité totale de référence (plafond)

  // Kits Management (Lots)
  isKit?: boolean;
  childEquipmentIds?: string[];
  parentId?: string;

  // Geolocation / Sites
  currentSiteId?: string;

  // Maintenance Preventive
  usageCount: number;
  usageCountBeforeMaintenance?: number;
  maintenanceIntervalDays?: number;
  nextMaintenanceDate?: string;
  lastMaintenanceDate?: string;

  lastUsageTimestamp?: string;
  isArchived: boolean;

  // Archive request circuit (TECHNICIAN requests, ADMIN validates)
  archiveRequested?: boolean;
  archiveRequestedAt?: string;
  archiveRequestedBy?: string;
  archiveRequestedByName?: string;
}

export interface EquipmentLog {
  id: string;
  tenantId: string;
  equipmentId: string;
  userId: string;
  timestamp: string; 
  action: EquipmentLogAction; 
  isOffline: boolean;
  isManual: boolean;
  source?: 'SCAN' | 'TABLET' | 'MANUAL';
  
  siteId?: string; // Chantier
  
  batchQuantityChange?: number; // +X or -Y for batches
  userNote?: string;
  sessionId?: string; 
  
  agentNameSnapshot?: string;
  equipmentNameSnapshot?: string;
  clientTimestamp?: string;
  serverTimestamp?: any;

  // Saisie a posteriori
  isAPosteriori?: boolean;
  declaredAt?: string;
}

export interface IncidentReport { // Ticketing System
  id: string;
  tenantId: string;
  equipmentId: string;
  userId: string; // reportedBy
  
  assignedTo?: string;
  assignedToName?: string;
  
  equipmentNameSnapshot: string;
  userNameSnapshot: string;
  
  message: string;
  tags: string[]; // ex: ['Mécanique', 'Urgent']
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ARCHIVED';
  
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: 'BREAKDOWN' | 'DAMAGE' | 'MISSING_PART' | 'PERIODIC_MAINTENANCE' | 'OTHER';
  
  resolutionNote?: string;
  resolutionTimestamp?: string;
  
  timestamp: string;
  serverTimestamp?: any;
}

// --- SIGNALEMENTS ---

export type SignalementStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ARCHIVED';

export interface SignalementReply {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  message: string;
  createdAt: string;
}

export interface Signalement {
  id: string;
  tenantId: string;
  createdBy: string;
  createdByName: string;
  createdByRole: UserRole;
  createdAt: string;
  title: string;
  description: string;
  equipmentId?: string;
  equipmentName?: string;
  siteId?: string;
  siteName?: string;
  status: SignalementStatus;
  replies: SignalementReply[];
  assignedTo?: string;
  assignedToName?: string;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  isArchived?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  type: 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'PHOTO';
  required: boolean;
  triggersIncidentIfFalse?: boolean;
}

export interface ChecklistTemplate {
  id: string;
  tenantId: string;
  name: string; 
  description?: string;
  
  triggerType: 'USE' | 'MAINTENANCE';
  targetContext: 'ALL' | 'TYPE' | 'SPECIFIC';
  targetValue?: string; 
  
  items: ChecklistItem[];
  isArchived: boolean;
}

export interface MaintenanceLog {
  id: string;
  tenantId: string;
  equipmentId: string;
  userId: string;
  checklistId: string;
  ticketId?: string; // If tied to a resolution
  
  equipmentNameSnapshot: string;
  userNameSnapshot: string;
  checklistNameSnapshot: string;
  
  answers: {
    [itemId: string]: {
      value: any;
      note?: string;
    }
  };
  
  generalNote?: string;
  timestamp: string;
  serverTimestamp?: any;
}