export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
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

export interface Equipment {
  id: string;
  tenantId: string;
  
  // Hierarchy
  type: string;        // e.g., "Outil portatif"
  subType: string;     // e.g., "Perceuse"
  brand: string;       // e.g., "Makita"
  model: string;       // e.g., "DHP482"
  serialNumber?: string; // N° de série fabricant
  uniqueId: string;    // Plaque d'immat, N° interne, ou ID unique attribué
  
  name: string;        // Auto-generated or custom: e.g. "Makita DHP482 (001)"
  qrCode: string;
  instructions?: string;
  
  // Equipment Status Management
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'ARCHIVED';
  
  // Batch Management (Petit Matériel)
  isBatch: boolean;    
  batchQuantity?: number;
  
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
  equipmentNameSnapshot?: string; // Captured at event time
  clientTimestamp?: string;
  serverTimestamp?: any;
}

export interface IncidentReport { // Ticketing System
  id: string;
  tenantId: string;
  equipmentId: string;
  userId: string; // reportedBy
  
  assignedTo?: string; // Technician ID
  
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