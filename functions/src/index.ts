import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();

const generateSecureQR = () => {
  return `MIKI_${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
};

async function verifyAccess(uid: string, tenantId: string, allowedRoles: string[]) {
  const userDoc = await db.collection("users").doc(uid).get();
  const userData = userDoc.data();

  if (!userData || userData.isDisabled || userData.isArchived) {
    throw new functions.https.HttpsError("permission-denied", "Compte inactif ou inconnu.");
  }

  const isGlobalAdmin =
    userData.tenantsAccess?.["platform"] === "ADMIN" ||
    (Array.isArray(userData.accessibleTenantIds) && userData.accessibleTenantIds.includes("platform"));

  if (isGlobalAdmin) return { user: userData, isGlobalAdmin: true };
  if (tenantId === "platform") return { user: userData, isGlobalAdmin: false, isSelf: true };

  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
  const tenantRole = userData.tenantsAccess?.[tenantId];
  
  if (typeof tenantRole === "string" && normalizedAllowed.includes(tenantRole.toUpperCase())) {
    return { user: userData, isGlobalAdmin: false };
  }

  // Fallback legacy
  if (Array.isArray(userData.accessibleTenantIds) && userData.accessibleTenantIds.includes(tenantId)) {
    const legacyRole = typeof userData.role === "string" ? userData.role.toUpperCase() : null;
    if (legacyRole && normalizedAllowed.includes(legacyRole)) {
      if (!userData.tenantsAccess?.[tenantId]) {
        await db.collection("users").doc(uid).set({ tenantsAccess: { [tenantId]: legacyRole } }, { merge: true });
      }
      return { user: userData, isGlobalAdmin: false };
    }
  }

  console.warn(`[AUTH FAIL] User ${uid} access denied for tenant ${tenantId}.`);
  throw new functions.https.HttpsError("permission-denied", "Droits insuffisants pour ce site.");
}

async function createManagerNotification(tenantId: string, title: string, message: string, type: string) {
    const [tenantSnap, platformSnap] = await Promise.all([
        db.collection("users").where("accessibleTenantIds", "array-contains", tenantId).get(),
        db.collection("users").where("accessibleTenantIds", "array-contains", "platform").get(),
    ]);

    // Merge, dedup by doc ID
    const seen = new Set<string>();
    const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (const doc of [...tenantSnap.docs, ...platformSnap.docs]) {
        if (!seen.has(doc.id)) { seen.add(doc.id); allDocs.push(doc); }
    }

    const batch = db.batch();
    let count = 0;
    allDocs.forEach(doc => {
        const data = doc.data();
        const role = data.tenantsAccess?.[tenantId] || data.role;
        const isPlatformAdmin = data.tenantsAccess?.['platform'] === 'ADMIN';
        if (role === 'ADMIN' || role === 'TECHNICIAN' || isPlatformAdmin) {
            const notifRef = db.collection("users").doc(doc.id).collection("notifications").doc();
            batch.set(notifRef, {
                id: notifRef.id,
                tenantId,
                userId: doc.id,
                title,
                message,
                type,
                read: false,
                timestamp: new Date().toISOString()
            });
            count++;
        }
    });
    if (count > 0) await batch.commit();
}

async function createAdminNotification(tenantId: string, title: string, message: string, type: string) {
    const platformSnap = await db.collection("users").where("accessibleTenantIds", "array-contains", "platform").get();
    const batch = db.batch();
    let count = 0;
    platformSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.tenantsAccess?.["platform"] === "ADMIN") {
            const notifRef = db.collection("users").doc(doc.id).collection("notifications").doc();
            batch.set(notifRef, {
                id: notifRef.id, tenantId, userId: doc.id,
                title, message, type, read: false,
                timestamp: new Date().toISOString()
            });
            count++;
        }
    });
    if (count > 0) await batch.commit();
}

async function writeAuditLog(params: {
  action: string;
  actorId: string;
  actorName: string;
  tenantId: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, any>;
}) {
  const category = params.action.startsWith('USER') ? 'USER' : 'STRUCTURE';

  let tenantName = params.tenantId;
  try {
    const tenantSnap = await db.collection("tenants").doc(params.tenantId).get();
    if (tenantSnap.exists) tenantName = tenantSnap.data()?.name || params.tenantId;
  } catch { /* use tenantId as fallback */ }

  const detailsStr = params.details
    ? Object.entries(params.details)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ')
    : undefined;

  const ref = db.collection("audit_logs").doc();
  return ref.set({
    id: ref.id,
    timestamp: new Date().toISOString(),
    serverTimestamp: Timestamp.now(),
    userId: params.actorId,
    userName: params.actorName,
    action: params.action,
    category,
    tenantId: params.tenantId,
    tenantName,
    ...(params.targetId ? { targetId: params.targetId } : {}),
    ...(params.targetName ? { targetName: params.targetName } : {}),
    ...(detailsStr ? { details: detailsStr } : {}),
  });
}

// --- LOGIQUE METIER MIKI (EQUIPEMENT) ---

export const processEquipmentScan = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");

    const { equipmentId, action, tenantId, details } = data;
    const userId = context.auth.uid;

    await verifyAccess(userId, tenantId, ["AGENT", "TECHNICIAN", "ADMIN"]);

    const [equipmentSnap, tenantSnap] = await Promise.all([
      db.collection("tenants").doc(tenantId).collection("equipments").doc(equipmentId).get(),
      db.collection("tenants").doc(tenantId).get(),
    ]);

    if (!equipmentSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Équipement introuvable.");
    }

    const eqData = equipmentSnap.data();
    
    if (details?.validationQr && eqData?.qrCode && eqData.qrCode !== details.validationQr) {
        throw new functions.https.HttpsError("permission-denied", "Le QR Code scanné ne correspond pas à l'équipement.");
    }

    return db.runTransaction(async (transaction) => {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.data();
      if (!userData) throw new functions.https.HttpsError("not-found", "Utilisateur introuvable.");

      const now = Timestamp.now();

      const serverNow = new Date().toISOString();
      const logRecord: any = {
        tenantId,
        equipmentId,
        userId,
        timestamp: details?.declaredAt || serverNow,
        action,
        isOffline: false,
        isManual: !!details?.declaredAt,
        source: "SCAN",
        userNote: details?.userNote,
        agentNameSnapshot: `${userData.firstName} ${userData.lastName}`,
        equipmentNameSnapshot: eqData?.name || "Inconnu",
        serverTimestamp: now,
      };

      if (details?.declaredAt) {
        logRecord.isAPosteriori = true;
        logRecord.declaredAt = details.declaredAt;
      }

      if (details?.siteId) logRecord.siteId = details.siteId;

      let newStatus = eqData?.status || "AVAILABLE";
      let userUpdates: any = {};
      let eqUpdates: any = { lastUsageTimestamp: new Date().toISOString() };
      
      let childrenRefs: FirebaseFirestore.DocumentReference[] = [];
      let childrenSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
      
      if (eqData?.isKit && Array.isArray(eqData.childEquipmentIds)) {
          childrenRefs = eqData.childEquipmentIds.map((id: string) => db.collection("tenants").doc(tenantId).collection("equipments").doc(id));
          if (childrenRefs.length > 0) {
              childrenSnaps = await transaction.getAll(...childrenRefs);
          }
      }
      
      let createdMaintenanceReport: any = null;

      switch (action) {
          case 'TAKE':
              if (newStatus === "MAINTENANCE") throw new functions.https.HttpsError("failed-precondition", "Équipement en maintenance.");
              if (eqData?.isBatch) {
                  const qty = details?.quantity || 1;
                  if (qty > (eqData.batchQuantity || 0)) throw new functions.https.HttpsError("out-of-range", "Stock insuffisant.");
                  eqUpdates.batchQuantity = FieldValue.increment(-qty);
                  logRecord.batchQuantityChange = -qty;
              } else {
                  if (newStatus === "IN_USE") throw new functions.https.HttpsError("failed-precondition", "Équipement déjà emprunté.");
                  newStatus = "IN_USE";
                  userUpdates.activeEquipmentId = equipmentId;
                  if (details?.siteId) eqUpdates.currentSiteId = details.siteId;
              }
              eqUpdates.usageCount = FieldValue.increment(1);
              break;
              
          case 'RETURN':
              if (eqData?.isBatch) {
                  const qty = details?.quantity || 1;
                  const batchTotal = eqData.batchTotal ?? eqData.batchQuantity ?? 0;
                  const currentQty = eqData.batchQuantity ?? 0;
                  if (currentQty + qty > batchTotal) {
                      throw new functions.https.HttpsError("out-of-range", `Impossible de restituer ${qty} unité(s) : le stock total est de ${batchTotal}.`);
                  }
                  eqUpdates.batchQuantity = FieldValue.increment(qty);
                  logRecord.batchQuantityChange = qty;
              } else {
                  newStatus = "AVAILABLE";
                  userUpdates.activeEquipmentId = null;
                  eqUpdates.currentSiteId = FieldValue.delete();
              }
              
              // Maintenance Prédictive Check
              let triggersMaintenance = false;
              let expectedUsageCount = (eqData?.usageCount || 0) + 1;
              if (eqData?.usageCountBeforeMaintenance && expectedUsageCount >= eqData.usageCountBeforeMaintenance) {
                  triggersMaintenance = true;
              }
              if (eqData?.nextMaintenanceDate && new Date(eqData.nextMaintenanceDate) <= new Date()) {
                  triggersMaintenance = true;
              }

              if (triggersMaintenance && !eqData?.isBatch) {
                  newStatus = "MAINTENANCE";
                  const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc();
                  createdMaintenanceReport = {
                      id: reportRef.id,
                      tenantId,
                      equipmentId,
                      userId: "SYSTEM",
                      userNameSnapshot: "Système de Maintenance Prédictive",
                      equipmentNameSnapshot: eqData?.name || "Inconnu",
                      message: "Maintenance préventive requise (seuil d'usure ou date limite atteinte).",
                      tags: ["Maintenance Préventive", "Automatique"],
                      status: "OPEN",
                      priority: "MEDIUM",
                      type: "PERIODIC_MAINTENANCE",
                      timestamp: new Date().toISOString(),
                      serverTimestamp: now,
                  };
                  transaction.set(reportRef, createdMaintenanceReport);
              }
              break;
              
          case 'REPORT':
              newStatus = "MAINTENANCE";
              break;
              
          case 'INTERVENTION':
              newStatus = "AVAILABLE";
              // Reset maintenance intervals
              eqUpdates.usageCount = 0;
              eqUpdates.lastMaintenanceDate = new Date().toISOString();
              if (eqData?.maintenanceIntervalDays) {
                  const nextDate = new Date();
                  nextDate.setDate(nextDate.getDate() + eqData.maintenanceIntervalDays);
                  eqUpdates.nextMaintenanceDate = nextDate.toISOString();
              }
              break;
      }

      eqUpdates.status = newStatus;

      // Write Log
      const logRef = db.collection("tenants").doc(tenantId).collection("equipmentLogs").doc();
      transaction.set(logRef, logRecord);

      // Update Equipment
      transaction.update(equipmentSnap.ref, eqUpdates);

      // Update User
      if (Object.keys(userUpdates).length > 0) transaction.update(userRef, userUpdates);
      
      // Update Children if Kit
      if (eqData?.isKit && childrenSnaps.length > 0) {
          childrenSnaps.forEach(snap => {
              if (snap.exists) {
                  let childUpdates: any = { status: action === 'TAKE' ? 'IN_USE' : 'AVAILABLE' };
                  if (action === 'TAKE' && details?.siteId) childUpdates.currentSiteId = details.siteId;
                  if (action === 'RETURN') childUpdates.currentSiteId = FieldValue.delete();
                  transaction.update(snap.ref, childUpdates);
              }
          });
      }

      return { id: logRef.id, logRecord, createdMaintenanceReport };
    }).then(async (result) => {
        // Post-transaction tasks
        if (result.createdMaintenanceReport) {
            await createManagerNotification(tenantId, `Maintenance Préventive Requise`, `L'équipement ${eqData?.name} a atteint son seuil de révision.`, "WARNING");
        }
        return result;
    });
  });

export const deleteEquipmentLog = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Action interdite.");
    const { tenantId, logId } = data;
    await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    await db.collection("tenants").doc(tenantId).collection("equipmentLogs").doc(logId).delete();
    return { success: true };
  });

// --- GESTION UTILISATEURS ---
// Le code manageUser existant reste valide car il gère des attributs génériques
export const manageUser = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    const { action, tenantId, userData, targetUserId } = data;

    if (action === "UPDATE" && targetUserId === context.auth.uid) {
      const keys = Object.keys(userData || {});
      if (keys.length === 1 && keys[0] === "mustChangePassword" && userData.mustChangePassword === false) {
        await db.collection("users").doc(targetUserId).update({ mustChangePassword: false });
        return { success: true };
      }
    }

    const { isGlobalAdmin, user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;

    if (action === "CREATE") {
      const tempPassword = Math.random().toString(36).slice(-8);
      const normalizedRole = typeof userData?.role === "string" ? userData.role.toUpperCase() : null;

      if (!normalizedRole) throw new functions.https.HttpsError("invalid-argument", "Rôle requis.");

      const created = await auth.createUser({
        email: userData.email,
        password: tempPassword,
        displayName: `${userData.firstName} ${userData.lastName}`,
      });

      await db.collection("users").doc(created.uid).set({
        ...userData,
        role: normalizedRole,
        id: created.uid,
        isArchived: false,
        isDisabled: false,
        mustChangePassword: true,
        tenantsAccess: { [tenantId]: normalizedRole },
        accessibleTenantIds: [tenantId],
      }, { merge: true });

      writeAuditLog({ action: 'USER_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: created.uid, targetName: `${userData.firstName} ${userData.lastName}`, details: { role: normalizedRole, email: userData.email } }).catch(console.error);
      return { uid: created.uid, password: tempPassword };
    }

    if (action === "UPDATE" || action === "RESET_PASSWORD") {
        const targetRef = db.collection("users").doc(targetUserId);
        const targetSnap = await targetRef.get();
        if (!targetSnap.exists) throw new functions.https.HttpsError("not-found", "User not found");
        const targetData = targetSnap.data();

        if (targetData?.tenantsAccess?.["platform"] === "ADMIN" && !isGlobalAdmin) {
          throw new functions.https.HttpsError("permission-denied", "Platform admin update denied.");
        }

        if (action === "UPDATE") {
          const cleanData = JSON.parse(JSON.stringify(userData));
          await targetRef.update(cleanData);
          if (cleanData.isDisabled !== undefined) {
            await auth.updateUser(targetUserId, { disabled: cleanData.isDisabled });
          }
          const auditAction = cleanData.isDisabled === true ? 'USER_DISABLED' : cleanData.isDisabled === false ? 'USER_ENABLED' : 'USER_UPDATED';
          const targetName = `${targetData?.firstName} ${targetData?.lastName}`;
          writeAuditLog({ action: auditAction, actorId: context.auth.uid, actorName, tenantId, targetId: targetUserId, targetName, details: cleanData }).catch(console.error);
          return { success: true };
        }

        if (action === "RESET_PASSWORD") {
          const tempPassword = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
          await auth.updateUser(targetUserId, { password: tempPassword });
          await targetRef.update({ mustChangePassword: true });
          writeAuditLog({ action: 'USER_PASSWORD_RESET', actorId: context.auth.uid, actorName, tenantId, targetId: targetUserId, targetName: `${targetData?.firstName} ${targetData?.lastName}` }).catch(console.error);
          return { success: true, tempPassword };
        }
    }
    if (action === "ADD_TENANT_ACCESS") {
      const emailToFind = (userData?.email || "").toLowerCase().trim();
      if (!emailToFind) throw new functions.https.HttpsError("invalid-argument", "Email requis.");
      let existingAuthUser: admin.auth.UserRecord;
      try {
        existingAuthUser = await auth.getUserByEmail(emailToFind);
      } catch {
        throw new functions.https.HttpsError("not-found", "Aucun compte trouvé avec cet email.");
      }
      const targetRef = db.collection("users").doc(existingAuthUser.uid);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) throw new functions.https.HttpsError("not-found", "Utilisateur introuvable en base.");
      const targetData = targetSnap.data()!;
      if (targetData.tenantsAccess?.["platform"] === "ADMIN") {
        throw new functions.https.HttpsError("permission-denied", "Opération non autorisée sur un administrateur plateforme.");
      }
      const normalizedRole = ((userData?.role as string) || "TECHNICIAN").toUpperCase();
      if (!["TECHNICIAN", "AGENT"].includes(normalizedRole)) {
        throw new functions.https.HttpsError("invalid-argument", "Seuls les rôles TECHNICIAN et AGENT peuvent être associés via cette action.");
      }
      if (targetData.tenantsAccess?.[tenantId]) {
        throw new functions.https.HttpsError("already-exists", "Cet utilisateur a déjà accès à ce site.");
      }
      await targetRef.update({
        [`tenantsAccess.${tenantId}`]: normalizedRole,
        accessibleTenantIds: FieldValue.arrayUnion(tenantId),
      });
      writeAuditLog({ action: 'USER_UPDATED', actorId: context.auth!.uid, actorName, tenantId, targetId: existingAuthUser.uid, targetName: `${targetData.firstName} ${targetData.lastName}`, details: { action: 'ADD_TENANT_ACCESS', role: normalizedRole } }).catch(console.error);
      return { success: true, targetId: existingAuthUser.uid, targetName: `${targetData.firstName} ${targetData.lastName}` };
    }

    if (action === "REMOVE_TENANT_ACCESS") {
      const targetRef = db.collection("users").doc(targetUserId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) throw new functions.https.HttpsError("not-found", "Utilisateur introuvable.");
      const targetData = targetSnap.data()!;
      const tenantIds = Object.keys(targetData.tenantsAccess || {}).filter((id: string) => id !== "platform");
      if (tenantIds.length <= 1) {
        throw new functions.https.HttpsError("failed-precondition", "Impossible de retirer le seul accès de cet utilisateur. Désactivez le compte à la place.");
      }
      await targetRef.update({
        [`tenantsAccess.${tenantId}`]: FieldValue.delete(),
        accessibleTenantIds: FieldValue.arrayRemove(tenantId),
      });
      writeAuditLog({ action: 'USER_UPDATED', actorId: context.auth!.uid, actorName, tenantId, targetId: targetUserId, targetName: `${targetData.firstName} ${targetData.lastName}`, details: { action: 'REMOVE_TENANT_ACCESS' } }).catch(console.error);
      return { success: true };
    }

    return { success: false };
  });

export const manageEquipment = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    const { action, tenantId, payload } = data;
    const { user: actorData, isGlobalAdmin } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;

    if (action === "CREATE") {
      const counterRef = db.collection("tenants").doc(tenantId).collection("counters").doc("equipmentTypeCounters");
      if (payload.categoryCode && payload.storageLocation) {
        const result = await db.runTransaction(async (tx) => {
          const counterSnap = await tx.get(counterRef);
          const counters = counterSnap.exists ? counterSnap.data() || {} : {};
          const newCount = (counters[payload.categoryCode] || 0) + 1;
          const now = new Date();
          const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
          const name = `${payload.categoryCode}${String(newCount).padStart(2, '0')}_${yyyymm}_${payload.storageLocation}`;
          const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc();
          tx.set(eqRef, {
            ...payload,
            id: eqRef.id,
            tenantId,
            name,
            type: payload.category || payload.categoryCode,
            qrCode: generateSecureQR(),
            status: payload.status || "AVAILABLE",
            usageCount: 0,
            isArchived: false,
            createdAt: new Date().toISOString(),
            ...(payload.isBatch ? { batchTotal: payload.batchTotal ?? payload.batchQuantity ?? 0 } : {}),
          });
          tx.set(counterRef, { [payload.categoryCode]: newCount }, { merge: true });
          return { success: true, id: eqRef.id, name };
        });
        writeAuditLog({ action: 'EQUIPMENT_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: result.id, targetName: result.name, details: { category: payload.categoryCode, isBatch: payload.isBatch } }).catch(console.error);
        return result;
      }
      const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
      await ref.set({
        ...payload,
        id: ref.id,
        tenantId,
        qrCode: generateSecureQR(),
        status: payload.status || "AVAILABLE",
        usageCount: 0,
        isArchived: false,
        createdAt: new Date().toISOString(),
        ...(payload.isBatch ? { batchTotal: payload.batchTotal ?? payload.batchQuantity ?? 0 } : {}),
      });
      writeAuditLog({ action: 'EQUIPMENT_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: ref.id, details: { category: payload.categoryCode, isBatch: payload.isBatch } }).catch(console.error);
      return { success: true, id: ref.id };
    }

    if (action === "CREATE_BATCH") {
      const { items } = payload;
      const counterRef = db.collection("tenants").doc(tenantId).collection("counters").doc("equipmentTypeCounters");
      const firstItem = items[0];
      if (firstItem?.categoryCode && firstItem?.storageLocation) {
        return await db.runTransaction(async (tx) => {
          const counterSnap = await tx.get(counterRef);
          const counters = counterSnap.exists ? counterSnap.data() || {} : {};
          let count = counters[firstItem.categoryCode] || 0;
          const ids: string[] = [];
          const now = new Date();
          const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
          for (const item of items) {
            count++;
            const name = `${item.categoryCode}${String(count).padStart(2, '0')}_${yyyymm}_${item.storageLocation}`;
            const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc();
            tx.set(eqRef, {
              ...item,
              id: eqRef.id,
              tenantId,
              name,
              type: item.category || item.categoryCode,
              qrCode: generateSecureQR(),
              status: item.status || "AVAILABLE",
              usageCount: 0,
              isArchived: false,
              createdAt: new Date().toISOString(),
            });
            ids.push(eqRef.id);
          }
          tx.set(counterRef, { [firstItem.categoryCode]: count }, { merge: true });
          return { success: true, ids };
        });
      }
      const batch = db.batch();
      const ids: string[] = [];
      for (const item of items) {
        const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
        batch.set(ref, {
          ...item,
          id: ref.id,
          tenantId,
          qrCode: generateSecureQR(),
          status: item.status || "AVAILABLE",
          usageCount: 0,
          isArchived: false,
          createdAt: new Date().toISOString(),
        });
        ids.push(ref.id);
      }
      await batch.commit();
      return { success: true, ids };
    }

    if (action === "UPDATE") {
      const { qrCode, id, ...safeUpdates } = payload.updates;
      const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id);
      await eqRef.update(safeUpdates);
      writeAuditLog({ action: 'EQUIPMENT_UPDATED', actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, details: safeUpdates }).catch(console.error);
      return { success: true };
    }

    if (action === "RENEW_QR") {
      const qr = generateSecureQR();
      await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).update({ qrCode: qr });
      return { success: true };
    }

    if (action === "REQUEST_ARCHIVE") {
      const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id);
      const eqSnap = await eqRef.get();
      if (!eqSnap.exists) throw new functions.https.HttpsError("not-found", "Équipement introuvable.");
      await eqRef.update({
        archiveRequested: true,
        archiveRequestedAt: new Date().toISOString(),
        archiveRequestedBy: context.auth.uid,
        archiveRequestedByName: actorName,
      });
      writeAuditLog({ action: 'EQUIPMENT_ARCHIVE_REQUESTED', actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: eqSnap.data()?.name }).catch(console.error);
      createAdminNotification(tenantId, 'Demande d\'archivage', `${actorName} demande l'archivage de "${eqSnap.data()?.name}".`, 'WARNING').catch(console.error);
      return { success: true };
    }

    if (action === "CANCEL_ARCHIVE_REQUEST") {
      const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id);
      await eqRef.update({
        archiveRequested: false,
        archiveRequestedAt: FieldValue.delete(),
        archiveRequestedBy: FieldValue.delete(),
        archiveRequestedByName: FieldValue.delete(),
      });
      return { success: true };
    }

    if (action === "ARCHIVE") {
      if (!isGlobalAdmin) throw new functions.https.HttpsError("permission-denied", "Seul un administrateur peut valider l'archivage.");
      const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).get();
      await eqSnap.ref.update({
        isArchived: true, status: "ARCHIVED",
        archiveRequested: false,
        archiveRequestedAt: FieldValue.delete(),
        archiveRequestedBy: FieldValue.delete(),
        archiveRequestedByName: FieldValue.delete(),
      });
      writeAuditLog({ action: 'EQUIPMENT_ARCHIVED', actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: eqSnap.data()?.name }).catch(console.error);
      return { success: true };
    }

    if (action === "FORCE_RETURN") {
      const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id);
      const eqSnap = await eqRef.get();
      if (!eqSnap.exists) throw new functions.https.HttpsError("not-found", "Équipement introuvable.");
      const eqData = eqSnap.data()!;
      if (eqData.status !== "IN_USE") throw new functions.https.HttpsError("failed-precondition", "L'équipement n'est pas emprunté.");

      const usersSnap = await db.collection("users").where("activeEquipmentId", "==", payload.id).get();
      const batch = db.batch();
      batch.update(eqRef, { status: "AVAILABLE", currentSiteId: FieldValue.delete() });
      usersSnap.docs.forEach(doc => batch.update(doc.ref, { activeEquipmentId: null }));

      const logRef = db.collection("tenants").doc(tenantId).collection("equipmentLogs").doc();
      batch.set(logRef, {
        id: logRef.id, tenantId,
        equipmentId: payload.id, equipmentName: eqData.name,
        userId: context.auth!.uid, userName: actorName,
        action: "FORCE_RETURN",
        timestamp: new Date().toISOString(),
        serverTimestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      writeAuditLog({ action: 'RESTITUTION_FORCED', actorId: context.auth!.uid, actorName, tenantId, targetId: payload.id, targetName: eqData.name, details: { reason: payload.reason || 'Restitution forcée' } }).catch(console.error);
      return { success: true };
    }

    if (action === "REACTIVATE") {
      if (!isGlobalAdmin) throw new functions.https.HttpsError("permission-denied", "Réactivation réservée aux administrateurs.");
      const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id);
      const eqSnap = await eqRef.get();
      if (!eqSnap.exists) throw new functions.https.HttpsError("not-found", "Équipement introuvable.");
      await eqRef.update({ isArchived: false, status: "AVAILABLE" });
      writeAuditLog({ action: 'EQUIPMENT_REACTIVATED', actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: eqSnap.data()?.name }).catch(console.error);
      return { success: true };
    }

    return { success: false };
  });

export const manageStructure = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    const { action, tenantId, payload } = data;
    const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;

    if (action === "CREATE_TENANT") {
      const ref = db.collection("tenants").doc();
      await ref.set({ id: ref.id, ...payload, status: "ACTIVE", createdAt: FieldValue.serverTimestamp() });
      writeAuditLog({ action: 'TENANT_CREATED', actorId: context.auth.uid, actorName, tenantId: ref.id, targetId: ref.id, targetName: payload.name }).catch(console.error);
      return { id: ref.id };
    }
    if (action === "UPDATE_TENANT") {
      await db.collection("tenants").doc(tenantId).update(payload);
      writeAuditLog({ action: 'TENANT_UPDATED', actorId: context.auth.uid, actorName, tenantId, details: payload }).catch(console.error);
      return { success: true };
    }
    return { success: false };
  });

export const manageSite = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    const { action, tenantId, payload } = data;
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);

    const coll = db.collection("tenants").doc(tenantId).collection("sites");

    if (action === "CREATE") {
      const ref = await coll.add({ ...payload, isArchived: false, createdAt: new Date().toISOString() });
      return { id: ref.id, success: true };
    }
    if (action === "UPDATE") {
      await coll.doc(payload.id).update(payload.updates);
      return { success: true };
    }
    if (action === "ARCHIVE") {
      await coll.doc(payload.id).update({ status: "ARCHIVED" });
      return { success: true };
    }
    return { success: false };
  });

export const submitReport = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    const { incidentReport, tenantId, action } = data;
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    if (action === "ARCHIVE") {
      const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
      const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id);
      const reportSnap = await reportRef.get();
      await reportRef.update({ status: "ARCHIVED" });
      writeAuditLog({ action: 'TICKET_ARCHIVED', actorId: context.auth.uid, actorName: `${actorData.firstName} ${actorData.lastName}`, tenantId, targetId: incidentReport.id, targetName: reportSnap.data()?.equipmentNameSnapshot }).catch(console.error);
      return { success: true };
    }

    if (action === "UPDATE_STATUS") {
      const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
      const updateData: any = { status: incidentReport.status };
      if (incidentReport.assignedTo !== undefined) {
        updateData.assignedTo = incidentReport.assignedTo;
        updateData.assignedToName = `${actorData.firstName} ${actorData.lastName}`;
      }
      if (incidentReport.resolutionNote !== undefined) updateData.resolutionNote = incidentReport.resolutionNote;
      if (incidentReport.status === 'RESOLVED' || incidentReport.status === 'ARCHIVED') {
        updateData.resolutionTimestamp = new Date().toISOString();
      }

      const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id);
      const reportSnap = await reportRef.get();
      const reportData = reportSnap.data();
      await reportRef.update(updateData);

      writeAuditLog({ action: 'TICKET_STATUS_CHANGED', actorId: context.auth.uid, actorName: `${actorData.firstName} ${actorData.lastName}`, tenantId, targetId: incidentReport.id, targetName: reportData?.equipmentNameSnapshot, details: { newStatus: incidentReport.status } }).catch(console.error);

      // Auto-update equipment traceability dates on resolution
      if (incidentReport.status === 'RESOLVED' && reportData?.equipmentId) {
        const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(reportData.equipmentId);
        const eqUpdates: any = {};
        const resolvedAt = new Date().toISOString();
        if (reportData.type === 'PERIODIC_MAINTENANCE') {
          eqUpdates.lastVisiteTechniqueDate = resolvedAt;
        } else if (reportData.type === 'BREAKDOWN' || reportData.type === 'DAMAGE') {
          eqUpdates.lastReparationDate = resolvedAt;
        }
        if (Object.keys(eqUpdates).length > 0) {
          await eqRef.update(eqUpdates);
        }
      }

      return { success: true };
    }

    await verifyAccess(context.auth.uid, tenantId, ["AGENT", "TECHNICIAN", "ADMIN"]);

    // Creation de Ticket
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(incidentReport.equipmentId).get();

    const record = {
      ...incidentReport,
      userId: context.auth.uid,
      userNameSnapshot: `${userData?.firstName} ${userData?.lastName}`,
      equipmentNameSnapshot: eqSnap.data()?.name || "Inconnu",
      status: "OPEN",
      timestamp: new Date().toISOString(),
      serverTimestamp: Timestamp.now(),
    };

    const ref = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(record);
    
    // Auto-update eq status if not batch
    if (!eqSnap.data()?.isBatch) {
        await eqSnap.ref.update({ status: 'MAINTENANCE' });
    }
    
    await createManagerNotification(tenantId, `Nouvel Incident Signalé: ${incidentReport.priority}`, `L'équipement ${eqSnap.data()?.name || "Inconnu"} requiert une attention.`, incidentReport.priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
    
    return { id: ref.id };
  });

export const manageChecklist = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    const { tenantId, action, payload } = data;
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);

    const coll = db.collection("tenants").doc(tenantId).collection("checklists");

    if (action === "CREATE") {
      const ref = await coll.add({ ...payload, isArchived: false });
      return { id: ref.id };
    }
    if (action === "UPDATE") {
      await coll.doc(payload.id).update(payload.updates);
      return { success: true };
    }
    if (action === "ARCHIVE") {
      await coll.doc(payload.id).update({ isArchived: true });
      return { success: true };
    }
    return { success: false, message: "Unknown action" };
  });

export const submitChecklistAnswers = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    const { tenantId, payload } = data;
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["AGENT", "TECHNICIAN", "ADMIN"]);

    // If there is an incident report to create (failed trigger item)
    if (payload.incidentReportData) {
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        const userData = userDoc.data();
        const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.incidentReportData.equipmentId).get();

        const incidentRecord = {
          ...payload.incidentReportData,
          userId: context.auth.uid,
          userNameSnapshot: `${userData?.firstName} ${userData?.lastName}`,
          equipmentNameSnapshot: eqSnap.data()?.name || "Inconnu",
          status: "OPEN",
          timestamp: new Date().toISOString(),
          serverTimestamp: Timestamp.now(),
        };

        const incidentRef = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(incidentRecord);
        payload.ticketId = incidentRef.id;
        
        if (!eqSnap.data()?.isBatch) {
            await eqSnap.ref.update({ status: 'MAINTENANCE' });
        }
        
        await createManagerNotification(tenantId, `Étape de Checklist Échouée`, `Sur l'équipement ${eqSnap.data()?.name || "Inconnu"}. Intervention bloquante signalée.`, "CRITICAL");
    }

    const record = {
      ...payload,
      incidentReportData: FieldValue.delete(),
      userId: context.auth.uid,
      timestamp: new Date().toISOString(),
      serverTimestamp: Timestamp.now(),
    };

    const ref = await db.collection("tenants").doc(tenantId).collection("maintenanceLogs").add(record);
    return { id: ref.id };
  });

export const manageEquipmentType = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    const { action, tenantId, payload } = data;
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    const coll = db.collection("tenants").doc(tenantId).collection("equipmentTypes");
    if (action === "CREATE") {
      const ref = await coll.add({ ...payload, tenantId, isArchived: false, createdAt: new Date().toISOString() });
      return { id: ref.id };
    }
    if (action === "ARCHIVE") {
      await coll.doc(payload.id).update({ isArchived: true });
      return { success: true };
    }
    return { success: false };
  });

// --- CENTRALES DE DILUTION ---

export const manageCdilUnit = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;

    const coll = db.collection("tenants").doc(tenantId).collection("cdilUnits");

    if (action === "CREATE") {
      const ref = coll.doc();
      await ref.set({
        id: ref.id,
        tenantId,
        serialNumber: payload.serialNumber,
        location: payload.location,
        service: payload.service || "",
        roomCode: payload.roomCode || "",
        isActive: true,
        createdAt: new Date().toISOString(),
        notes: payload.notes || "",
      });
      writeAuditLog({ action: "CDIL_UNIT_CREATED", actorId: context.auth.uid, actorName, tenantId, targetId: ref.id, targetName: payload.location, details: { serialNumber: payload.serialNumber } }).catch(console.error);
      return { id: ref.id };
    }

    if (action === "UPDATE") {
      const { id, ...updates } = payload;
      await coll.doc(id).update(updates);
      return { success: true };
    }

    if (action === "DEACTIVATE") {
      await coll.doc(payload.id).update({ isActive: false });
      writeAuditLog({ action: "CDIL_UNIT_DEACTIVATED", actorId: context.auth.uid, actorName, tenantId, targetId: payload.id }).catch(console.error);
      return { success: true };
    }

    return { success: false };
  });

export const manageVisitSession = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "ADMIN"]);

    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    const technicianName = `${userData?.firstName} ${userData?.lastName}`;

    const coll = db.collection("tenants").doc(tenantId).collection("visitSessions");

    if (action === "CREATE") {
      const type = payload.type || "CDIL";
      const sessionType: "PERIODIQUE" | "INTERVENTION" = payload.sessionType || "PERIODIQUE";

      // Charger toutes les unités actives
      const allUnitsSnap = await db.collection("tenants").doc(tenantId).collection("cdilUnits").where("isActive", "==", true).get();
      let unitDocs = allUnitsSnap.docs;

      // Pour une intervention inopinée, filtrer sur les unitIds fournis
      if (sessionType === "INTERVENTION" && Array.isArray(payload.unitIds) && payload.unitIds.length > 0) {
        unitDocs = unitDocs.filter(u => payload.unitIds.includes(u.id));
      }

      const emptyEntries = unitDocs.map(u => {
        const d = u.data();
        return { unitId: u.id, serialNumber: d.serialNumber, location: d.location, service: d.service, buse: "ok", crepine: "ok", ligne: "ok", remarks: "" };
      });

      const defaultTitle = sessionType === "INTERVENTION"
        ? `Intervention inopinée — ${new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`
        : `Visite technique ${new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`;

      const ref = coll.doc();
      await ref.set({
        id: ref.id,
        tenantId,
        type,
        sessionType,
        title: payload.title || defaultTitle,
        date: payload.date || new Date().toISOString().split('T')[0],
        technicianId: context.auth.uid,
        technicianName,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        entries: emptyEntries,
      });
      return { id: ref.id };
    }

    if (action === "SAVE_ENTRIES") {
      // Mise à jour partielle des entrées (le technicien enregistre son avancement)
      const sessionRef = coll.doc(payload.sessionId);
      await sessionRef.update({ entries: payload.entries });
      return { success: true };
    }

    if (action === "COMPLETE") {
      // Clôture de la session : met à jour currentState de chaque cdilUnit
      const sessionRef = coll.doc(payload.sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) throw new functions.https.HttpsError("not-found", "Session introuvable.");
      const session = sessionSnap.data()!;
      if (session.status === "COMPLETED") throw new functions.https.HttpsError("failed-precondition", "Session déjà clôturée.");

      const now = new Date().toISOString();
      const batch = db.batch();

      // Mettre à jour chaque unité visitée avec son nouvel état
      for (const entry of session.entries as any[]) {
        if (!entry.unitId) continue;
        const unitRef = db.collection("tenants").doc(tenantId).collection("cdilUnits").doc(entry.unitId);
        batch.update(unitRef, {
          lastVisitDate: now,
          currentState: { buse: entry.buse, crepine: entry.crepine, ligne: entry.ligne },
          ...(entry.remarks ? { notes: entry.remarks } : {}),
        });
      }

      // Clôturer la session
      batch.update(sessionRef, { status: "COMPLETED", completedAt: now });
      await batch.commit();

      writeAuditLog({ action: "VISIT_SESSION_COMPLETED", actorId: context.auth.uid, actorName: technicianName, tenantId, targetId: payload.sessionId, targetName: session.title, details: { type: session.type, unitCount: session.entries?.length } }).catch(console.error);
      return { success: true };
    }

    if (action === "DELETE_DRAFT") {
      const sessionRef = coll.doc(payload.sessionId);
      const snap = await sessionRef.get();
      if (snap.data()?.status !== "DRAFT") throw new functions.https.HttpsError("failed-precondition", "Seules les sessions en brouillon peuvent être supprimées.");
      await sessionRef.delete();
      return { success: true };
    }

    return { success: false };
  });

export const manageSignalement = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required.");

    const { action, tenantId, payload } = data;
    const { user: actorData, isGlobalAdmin } = await verifyAccess(context.auth.uid, tenantId, ["AGENT", "CLIENT", "TECHNICIAN", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;
    const actorRole = (actorData.tenantsAccess?.[tenantId] || actorData.role || "AGENT") as string;
    const canManage = isGlobalAdmin || actorRole === "TECHNICIAN" || actorRole === "ADMIN";

    const coll = db.collection("tenants").doc(tenantId).collection("signalements");

    if (action === "CREATE") {
      const ref = coll.doc();
      await ref.set({
        id: ref.id, tenantId,
        createdBy: context.auth.uid,
        createdByName: actorName,
        createdByRole: actorRole,
        createdAt: new Date().toISOString(),
        title: payload.title,
        description: payload.description,
        equipmentId: payload.equipmentId || null,
        equipmentName: payload.equipmentName || null,
        siteId: payload.siteId || null,
        siteName: payload.siteName || null,
        status: "NEW",
        replies: [],
        isArchived: false,
      });
      writeAuditLog({ action: "SIGNALEMENT_CREATED", actorId: context.auth.uid, actorName, tenantId, targetId: ref.id, targetName: payload.title }).catch(console.error);
      createManagerNotification(tenantId, "Nouveau signalement", `${actorName} : "${payload.title}"`, "WARNING").catch(console.error);
      return { id: ref.id, success: true };
    }

    if (action === "ADD_REPLY") {
      const ref = coll.doc(payload.id);
      const snap = await ref.get();
      if (!snap.exists) throw new functions.https.HttpsError("not-found", "Signalement introuvable.");
      const reply = {
        id: `r_${context.auth.uid}_${Date.now()}`,
        authorId: context.auth.uid,
        authorName: actorName,
        authorRole: actorRole,
        message: payload.message,
        createdAt: new Date().toISOString(),
      };
      const updates: Record<string, any> = { replies: FieldValue.arrayUnion(reply) };
      if (snap.data()?.status === "NEW") updates.status = "IN_PROGRESS";
      await ref.update(updates);
      writeAuditLog({ action: "SIGNALEMENT_UPDATED", actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: snap.data()?.title, details: { action: "reply" } }).catch(console.error);
      return { success: true };
    }

    if (action === "UPDATE_STATUS") {
      if (!canManage) throw new functions.https.HttpsError("permission-denied", "Droits insuffisants.");
      const ref = coll.doc(payload.id);
      await ref.update({ status: payload.status });
      writeAuditLog({ action: "SIGNALEMENT_UPDATED", actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, details: { status: payload.status } }).catch(console.error);
      return { success: true };
    }

    if (action === "CLOSE") {
      if (!canManage) throw new functions.https.HttpsError("permission-denied", "Droits insuffisants.");
      const ref = coll.doc(payload.id);
      const snap = await ref.get();
      await ref.update({
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        closedBy: context.auth.uid,
        closedByName: actorName,
      });
      writeAuditLog({ action: "SIGNALEMENT_CLOSED", actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: snap.data()?.title }).catch(console.error);
      return { success: true };
    }

    if (action === "ARCHIVE") {
      if (!canManage) throw new functions.https.HttpsError("permission-denied", "Droits insuffisants.");
      await coll.doc(payload.id).update({ isArchived: true, status: "ARCHIVED" });
      return { success: true };
    }

    return { success: false };
  });

export const seedSystem = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (process.env.FUNCTIONS_EMULATOR !== 'true') {
      throw new functions.https.HttpsError("failed-precondition", "Disponible uniquement en mode émulateur.");
    }
    // Basic seeding
    const email = "admin@miki.nc";
    const password = "password123";
    let uid = "";
    try {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
      await auth.updateUser(uid, { password, disabled: false });
    } catch {
      const user = await auth.createUser({ email, password, displayName: "Super Admin" });
      uid = user.uid;
    }

    await db.collection("users").doc(uid).set({
      id: uid, email, firstName: "Super", lastName: "Admin", role: "ADMIN",
      tenantsAccess: { platform: "ADMIN" }, accessibleTenantIds: ["platform"],
      isArchived: false, isDisabled: false, mustChangePassword: false,
    }, { merge: true });

    return { success: true };
  });

export const repairAdminProfile = functions
  .region("australia-southeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    await verifyAccess(context.auth.uid, "platform", ["ADMIN"]);
    await db.collection("users").doc(context.auth.uid).set({
      tenantsAccess: { platform: "ADMIN" }, role: "ADMIN", accessibleTenantIds: FieldValue.arrayUnion("platform"),
    }, { merge: true });
    return { success: true };
  });

export const nukePlatform = functions
  .region("australia-southeast1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    return { success: false, message: "Disabled for safety." };
  });