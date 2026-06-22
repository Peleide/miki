import { User, UserRole, Equipment, EquipmentLog, Tenant, EquipmentLogAction, AuditLog, IncidentReport, AppNotification, Site } from '../types';
import { dbFirestore, auth, functions } from './firebaseConfig';
import { 
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, Timestamp, onSnapshot, updateDoc 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  updatePassword as firebaseUpdatePassword 
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

export const TimeUtils = {
  formatInTimezone: (ts: any, timezone: string, options: Intl.DateTimeFormatOptions) => {
    if (!ts) return '';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: timezone }).format(date);
  },
  getDateString: (ts: any, timezone: string) => {
    return TimeUtils.formatInTimezone(ts, timezone, { year: 'numeric', month: '2-digit', day: '2-digit' })
      .split('/').reverse().join('-'); 
  }
};

class DatabaseService {
  
  private async call(name: string, data: any) {
    const fn = httpsCallable(functions, name);
    try {
        const result = await fn(data);
        return result.data;
    } catch (e: any) {
        console.error(`[MIKI BACKEND] ${name} error:`, e);
        throw new Error(e.message || "Erreur de communication avec le serveur.");
    }
  }

  // --- WRITE OPERATIONS ---

  async processEquipmentScan(equipmentId: string, action: EquipmentLogAction, user: User, details?: { validationQr?: string, quantity?: number, userNote?: string, siteId?: string }) {
      return await this.call('processEquipmentScan', { 
          equipmentId, 
          action, 
          tenantId: user.tenantId, 
          details 
      }) as EquipmentLog;
  }

  async deleteEquipmentLog(tenantId: string, logId: string, user: User) {
      return await this.call('deleteEquipmentLog', { tenantId, logId });
  }

  async createUser(tid: string, fn: string, ln: string, em: string, role: UserRole) {
      return await this.call('manageUser', {
          action: 'CREATE',
          tenantId: tid,
          userData: { email: em, firstName: fn, lastName: ln, role: role }
      }) as User;
  }

  async managerUpdateUser(tenantId: string, userId: string, updates: any, manager: User) {
      return await this.call('manageUser', {
          action: 'UPDATE',
          tenantId: tenantId,
          targetUserId: userId,
          userData: updates
      });
  }

  async adminUpdateUser(userId: string, updates: Partial<User>, admin: User) {
      return await this.call('manageUser', {
          action: 'UPDATE',
          tenantId: 'platform',
          targetUserId: userId,
          userData: updates
      });
  }

  async managerResetPassword(userId: string, manager: User) {
      return await this.call('manageUser', { action: 'RESET_PASSWORD', tenantId: manager.tenantId, targetUserId: userId }) as { success: boolean, tempPassword?: string };
  }

  async createTenant(name: string, quotas: {equipments: number, users: number}) {
      return await this.call('manageStructure', { action: 'CREATE_TENANT', tenantId: 'platform', payload: { name, quotas } }) as Tenant;
  }

  async createEquipment(tid: string, eq: Omit<Equipment, 'id' | 'tenantId' | 'qrCode'>) {
      return await this.call('manageEquipment', { action: 'CREATE', tenantId: tid, payload: eq });
  }

  async updateEquipment(equipmentId: string, updates: Partial<Equipment>, manager: User) {
      return await this.call('manageEquipment', { action: 'UPDATE', tenantId: manager.tenantId, payload: { id: equipmentId, updates: updates } });
  }
  
  async renewEquipmentQrCode(equipmentId: string, manager: User) {
      return await this.call('manageEquipment', { action: 'RENEW_QR', tenantId: manager.tenantId, payload: { id: equipmentId } });
  }

  async deleteEquipment(equipmentId: string, manager: User) {
      // Pour raison de traçabilité, la modification "ARCHIVED" est préférée, mais si l'UI appelle DELETE:
      return await this.call('manageEquipment', { action: 'ARCHIVE', tenantId: manager.tenantId, payload: { id: equipmentId } });
  }

  async adminUpdateTenantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', admin: User) {
      return await this.call('manageStructure', { action: 'UPDATE_TENANT', tenantId: id, payload: { status } });
  }

  async adminUpdateTenantBranding(id: string, logoUrl: string, admin: User) {
      return await this.call('manageStructure', { action: 'UPDATE_TENANT', tenantId: id, payload: { logoUrl } });
  }

  async adminUpdateTenantTimezone(id: string, timezone: string, admin: User) {
      return await this.call('manageStructure', { action: 'UPDATE_TENANT', tenantId: id, payload: { timezone } });
  }

  async createIncidentReport(incidentReport: Omit<IncidentReport, 'id' | 'userNameSnapshot' | 'equipmentNameSnapshot' | 'timestamp' | 'serverTimestamp' | 'status' | 'assignedTo'>, user: User) {
      return await this.call('submitReport', { incidentReport, tenantId: user.tenantId }) as IncidentReport;
  }
  
  async archiveReport(tenantId: string, reportId: string, manager: User) {
      return await this.call('submitReport', { action: 'ARCHIVE', tenantId, incidentReport: { id: reportId } });
  }

  async updateReportStatus(tenantId: string, reportId: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ARCHIVED', assignedTo?: string | null) {
      return await this.call('submitReport', { action: 'UPDATE_STATUS', tenantId, incidentReport: { id: reportId, status, assignedTo } });
  }

  // --- CHECKLISTS ---
  async createChecklist(tenantId: string, payload: any) {
      return await this.call('manageChecklist', { action: 'CREATE', tenantId, payload });
  }
  
  async updateChecklist(tenantId: string, id: string, updates: any) {
      return await this.call('manageChecklist', { action: 'UPDATE', tenantId, payload: { id, updates } });
  }
  
  async archiveChecklist(tenantId: string, id: string) {
      return await this.call('manageChecklist', { action: 'ARCHIVE', tenantId, payload: { id } });
  }
  
  async submitChecklistAnswers(tenantId: string, payload: any) {
      return await this.call('submitChecklistAnswers', { tenantId, payload });
  }

  // --- SITES ---
  async createSite(tenantId: string, payload: Omit<Site, 'id' | 'tenantId' | 'status' | 'createdAt'>) {
      return await this.call('manageSite', { action: 'CREATE', tenantId, payload });
  }
  
  async updateSite(tenantId: string, id: string, updates: Partial<Site>) {
      return await this.call('manageSite', { action: 'UPDATE', tenantId, payload: { id, updates } });
  }

  async archiveSite(tenantId: string, id: string) {
      return await this.call('manageSite', { action: 'ARCHIVE', tenantId, payload: { id } });
  }
  
  // --- READ OPERATIONS ---

  async authenticate(email: string, password: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return await this.getUserProfile(cred.user!.uid);
    } catch (e: any) {
      throw new Error("Identifiants incorrects.");
    }
  }

  private mapUserDoc(docSnap: any): User {
    const data = docSnap.data()!;
    if (data.isArchived || data.isDisabled) throw new Error("Compte inactif.");

    const tenantsAccess = data.tenantsAccess || {};
    
    // --- CORRECTIF DE SYNCHRONISATION ---
    if (data.accessibleTenantIds && Array.isArray(data.accessibleTenantIds)) {
        data.accessibleTenantIds.forEach((tid: string) => {
            if (!tenantsAccess[tid]) {
                tenantsAccess[tid] = (tid === 'platform' ? UserRole.ADMIN : (data.role || UserRole.AGENT));
            }
        });
    }
    // -------------------------------------

    const tenantIds = Object.keys(tenantsAccess);
    const activeTenantId = tenantsAccess['platform'] ? 'platform' : (tenantIds[0] || '');
    const activeRole = activeTenantId ? (tenantsAccess[activeTenantId] || UserRole.AGENT) : (data.role || UserRole.AGENT);

    return {
      id: docSnap.id, email: data.email, firstName: data.firstName, lastName: data.lastName,
      isArchived: data.isArchived, isDisabled: data.isDisabled || false,
      mustChangePassword: data.mustChangePassword, tenantsAccess, 
      accessibleTenantIds: data.accessibleTenantIds || [],
      tenantId: activeTenantId, role: activeRole,
      activeSessionId: data.activeSessionId || null, activeEquipmentId: data.activeEquipmentId || null
    } as User;
  }

  async getUserProfile(uid: string): Promise<User> {
    const docRef = doc(dbFirestore, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Profil introuvable.");

    // --- AUTO-REPAIR LEGACY ACCOUNTS ---
    const data = docSnap.data();
    const tenantsAccess = data.tenantsAccess || {};
    const storedIds = data.accessibleTenantIds || [];
    
    let needsRepair = false;
    const patchedAccess = { ...tenantsAccess };
    const patchedIds = [...storedIds];

    if (storedIds.length > 0) {
        storedIds.forEach((tid: string) => {
            if (!patchedAccess[tid]) {
                needsRepair = true;
                patchedAccess[tid] = (tid === 'platform' ? UserRole.ADMIN : (data.role || UserRole.AGENT));
            }
        });
    }

    Object.keys(patchedAccess).forEach(tid => {
        if (!patchedIds.includes(tid)) {
            needsRepair = true;
            patchedIds.push(tid);
        }
    });

    if (needsRepair) {
        console.warn(`[MIKI SELF-HEAL] Synchronisation Map/Array pour ${uid}.`);
        await updateDoc(docRef, { tenantsAccess: patchedAccess, accessibleTenantIds: patchedIds });
        data.tenantsAccess = patchedAccess;
        data.accessibleTenantIds = patchedIds;
    }
    // -----------------------------------

    return this.mapUserDoc(docSnap);
  }

  subscribeToUserProfile(uid: string, onUpdate: (user: User) => void): () => void {
    return onSnapshot(doc(dbFirestore, 'users', uid), (docSnap) => {
      if (docSnap.exists()) {
        try {
          const user = this.mapUserDoc(docSnap);
          onUpdate(user);
        } catch (e) {
          console.error("User subscription error (likely disabled):", e);
        }
      }
    });
  }
  
  // --- NOTIFICATIONS ---
  subscribeToNotifications(userId: string, onUpdate: (notifs: AppNotification[]) => void): () => void {
    const q = query(collection(dbFirestore, 'users', userId, 'notifications'), orderBy('timestamp', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
        const res = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        onUpdate(res);
    });
  }
  
  async markNotificationRead(userId: string, notifId: string) {
    const ref = doc(dbFirestore, 'users', userId, 'notifications', notifId);
    await updateDoc(ref, { read: true });
  }
  
  async markAllNotificationsRead(userId: string) {
    const q = query(collection(dbFirestore, 'users', userId, 'notifications'), where('read', '==', false));
    const snap = await getDocs(q);
    const updates = snap.docs.map(d => updateDoc(d.ref, { read: true }));
    await Promise.all(updates);
  }

  async updatePassword(user: User, newPassword: string): Promise<User> {
    if (!auth.currentUser) throw new Error("Non connecté.");
    
    let contextTenantId = 'platform';
    const hasPlatformAccess = user.tenantsAccess['platform'] === UserRole.ADMIN;
    
    if (!hasPlatformAccess) {
        const availableTenants = Object.keys(user.tenantsAccess).filter(t => t !== 'platform');
        if (availableTenants.length > 0) {
            contextTenantId = availableTenants[0];
        }
    }

    await firebaseUpdatePassword(auth.currentUser, newPassword);
    
    await this.call('manageUser', { 
        action: 'UPDATE', 
        tenantId: contextTenantId, 
        targetUserId: user.id, 
        userData: { mustChangePassword: false } 
    });
    
    return await this.getUserProfile(user.id);
  }

  async switchTenant(user: User, targetTenantId: string): Promise<User> {
    const isGlobalAdmin = user.role === UserRole.ADMIN || user.tenantsAccess['platform'] === UserRole.ADMIN;
    
    if (!isGlobalAdmin && !user.tenantsAccess[targetTenantId]) {
        throw new Error("Accès refusé.");
    }
    
    let newRole = user.tenantsAccess[targetTenantId];
    if (!newRole) {
        newRole = (isGlobalAdmin && targetTenantId !== 'platform') ? UserRole.MANAGER : user.role;
    }
    
    return { ...user, tenantId: targetTenantId, role: newRole };
  }

  async getAuditLogs(tenantId?: string, limitVal = 100): Promise<AuditLog[]> {
    try {
        let q;
        if (tenantId && tenantId !== 'platform') {
            q = query(collection(dbFirestore, 'audit_logs'), where('tenantId', '==', tenantId), orderBy('serverTimestamp', 'desc'), limit(limitVal));
        } else {
            q = query(collection(dbFirestore, 'audit_logs'), orderBy('serverTimestamp', 'desc'), limit(limitVal));
        }
        
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AuditLog));
    } catch (e: any) {
        if (e.code === 'failed-precondition') {
            const qFallback = query(collection(dbFirestore, 'audit_logs'), orderBy('serverTimestamp', 'desc'), limit(500));
            const snap = await getDocs(qFallback);
            let logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
            if (tenantId && tenantId !== 'platform') logs = logs.filter(l => l.tenantId === tenantId);
            return logs.slice(0, limitVal);
        }
        throw e;
    }
  }
  
  async getTenantsForUser(user: User): Promise<Tenant[]> {
    const isGlobalAdmin = user.role === UserRole.ADMIN || user.tenantsAccess['platform'] === UserRole.ADMIN;
    if (isGlobalAdmin) return this.getAllTenants();
    
    const ids = Object.keys(user.tenantsAccess).filter(id => id !== 'platform');
    const promises = ids.map(id => getDoc(doc(dbFirestore, 'tenants', id)));
    const snaps = await Promise.all(promises);
    return snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as Tenant));
  }

  async getUsers(tenantId?: string, includeArchived = false, limitVal = 100) { 
    let q: any = collection(dbFirestore, 'users');
    if (tenantId) q = query(q, where('accessibleTenantIds', 'array-contains', tenantId));
    q = query(q, limit(limitVal));
    const snap = await getDocs(q); 
    
    let res = snap.docs.map((d: any) => {
        const data = d.data();
        let computedRole = UserRole.AGENT;

        if (tenantId) {
            computedRole = data.tenantsAccess?.[tenantId] || UserRole.AGENT;
        } else {
            if (data.role) computedRole = data.role;
            else if (data.tenantsAccess?.['platform']) computedRole = data.tenantsAccess['platform'];
            else {
                 const roles = Object.values(data.tenantsAccess || {});
                 if (roles.includes('MANAGER')) computedRole = UserRole.MANAGER;
            }
        }

        return { id: d.id, ...data, tenantId, role: computedRole } as User;
    });

    return includeArchived ? res : res.filter(u => !u.isArchived);
  }

  async getEquipments(tid: string, inc = false) { return this.fetchSub<Equipment>(tid, 'equipments', inc); }
  async getChecklists(tid: string, inc = false) { return this.fetchSub<any>(tid, 'checklists', inc); }
  async getSites(tid: string, inc = false) { return this.fetchSub<Site>(tid, 'sites', inc); }
  async getTenant(tid: string) { const s = await getDoc(doc(dbFirestore, 'tenants', tid)); return s.exists() ? { id: s.id, ...s.data() } as Tenant : undefined; }
  async getAllTenants() { const s = await getDocs(collection(dbFirestore, 'tenants')); return s.docs.map(d => ({ id: d.id, ...d.data() })) as Tenant[]; }
  
  async getAllUsers(max = 200) { 
    return this.getUsers(undefined, true, max); 
  }

  private async fetchSub<T>(tid: string, col: string, inc: boolean): Promise<T[]> {
    const s = await getDocs(collection(dbFirestore, 'tenants', tid, col));
    let res = s.docs.map(d => ({ id: d.id, ...d.data() })) as unknown as T[];
    return inc ? res : (res as any[]).filter(r => !(r as any).isArchived && (r as any).status !== 'ARCHIVED');
  }

  async getEquipmentLogs(tid: string, role: UserRole, limitVal = 300, dateRange?: { start: string, end: string }) {
    const ref = collection(dbFirestore, 'tenants', tid, 'equipmentLogs');
    let q = query(ref, orderBy('timestamp', 'desc'), limit(limitVal));
    if (dateRange?.start && dateRange?.end) {
        q = query(ref, where('timestamp', '>=', dateRange.start), where('timestamp', '<=', dateRange.end + 'T23:59:59'), orderBy('timestamp', 'desc'), limit(limitVal));
    }
    const snap = await getDocs(q);
    let res = snap.docs.map(d => ({ id: d.id, ...d.data() } as EquipmentLog));
    return role === UserRole.CLIENT ? res.map(c => ({ ...c, agentNameSnapshot: 'Technicien/Agent', userId: 'ANON' })) : res;
  }
  
  async getAnalyticsData(tid: string, startDate: string, endDate: string) {
      const q = query(
          collection(dbFirestore, 'tenants', tid, 'equipmentLogs'),
          where('timestamp', '>=', startDate),
          where('timestamp', '<=', endDate + 'T23:59:59'),
          orderBy('timestamp', 'asc') 
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as EquipmentLog));
  }

  async getEquipmentLogsForAI(tid: string, role: UserRole, filters?: any) {
    const q = query(collection(dbFirestore, 'tenants', tid, 'equipmentLogs'), orderBy('serverTimestamp', 'desc'), limit(50));
    const s = await getDocs(q);
    let res = s.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    if (filters?.equipmentId) res = res.filter(c => c.equipmentId === filters.equipmentId);
    if (filters?.date) res = res.filter(c => c.timestamp.startsWith(filters.date));
    return res;
  }

  async getIncidentReports(tid: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ARCHIVED' = 'OPEN') {
      const q = query(collection(dbFirestore, 'tenants', tid, 'incidentReports'), where('status', '==', status));
      const s = await getDocs(q);
      return s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as IncidentReport)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async getTenantUsageMetrics(tid: string) {
    if (tid === 'platform') return { equipmentsCount: 0, usersCount: 0 };
    const [equipments, users] = await Promise.all([
        getDocs(collection(dbFirestore, 'tenants', tid, 'equipments')),
        getDocs(query(collection(dbFirestore, 'users'), where('accessibleTenantIds', 'array-contains', tid)))
    ]);
    return { equipmentsCount: equipments.size, usersCount: users.size };
  }

  async checkDbEmpty() { const s = await getDocs(query(collection(dbFirestore, 'tenants'), limit(1))); return s.empty; }
  async seedDatabase() { return await this.call('seedSystem', {}); }
  async repairAdminProfile() { return await this.call('repairAdminProfile', {}); }
  
  async dangerousResetPlatform(adminId: string) { 
      return await this.call('nukePlatform', {}); 
  }
}

export const db = new DatabaseService();
