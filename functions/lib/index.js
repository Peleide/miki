"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nukePlatform = exports.repairAdminProfile = exports.seedSystem = exports.submitChecklistAnswers = exports.manageChecklist = exports.submitReport = exports.manageSite = exports.manageStructure = exports.manageEquipment = exports.manageUser = exports.deleteEquipmentLog = exports.processEquipmentScan = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
admin.initializeApp();
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();
const generateSecureQR = () => {
    return `MIKI_${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
};
async function verifyAccess(uid, tenantId, allowedRoles) {
    var _a, _b, _c;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData || userData.isDisabled || userData.isArchived) {
        throw new functions.https.HttpsError("permission-denied", "Compte inactif ou inconnu.");
    }
    const isGlobalAdmin = ((_a = userData.tenantsAccess) === null || _a === void 0 ? void 0 : _a["platform"]) === "ADMIN" ||
        (Array.isArray(userData.accessibleTenantIds) && userData.accessibleTenantIds.includes("platform"));
    if (isGlobalAdmin)
        return { user: userData, isGlobalAdmin: true };
    if (tenantId === "platform")
        return { user: userData, isGlobalAdmin: false, isSelf: true };
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
    const tenantRole = (_b = userData.tenantsAccess) === null || _b === void 0 ? void 0 : _b[tenantId];
    if (typeof tenantRole === "string" && normalizedAllowed.includes(tenantRole.toUpperCase())) {
        return { user: userData, isGlobalAdmin: false };
    }
    // Fallback legacy
    if (Array.isArray(userData.accessibleTenantIds) && userData.accessibleTenantIds.includes(tenantId)) {
        const legacyRole = typeof userData.role === "string" ? userData.role.toUpperCase() : null;
        if (legacyRole && normalizedAllowed.includes(legacyRole)) {
            if (!((_c = userData.tenantsAccess) === null || _c === void 0 ? void 0 : _c[tenantId])) {
                await db.collection("users").doc(uid).set({ tenantsAccess: { [tenantId]: legacyRole } }, { merge: true });
            }
            return { user: userData, isGlobalAdmin: false };
        }
    }
    console.warn(`[AUTH FAIL] User ${uid} access denied for tenant ${tenantId}.`);
    throw new functions.https.HttpsError("permission-denied", "Droits insuffisants pour ce site.");
}
async function createManagerNotification(tenantId, title, message, type) {
    const snap = await db.collection("users").where("accessibleTenantIds", "array-contains", tenantId).get();
    const batch = db.batch();
    snap.docs.forEach(doc => {
        var _a, _b;
        const data = doc.data();
        const role = ((_a = data.tenantsAccess) === null || _a === void 0 ? void 0 : _a[tenantId]) || data.role;
        if (role === 'MANAGER' || role === 'ADMIN' || ((_b = data.tenantsAccess) === null || _b === void 0 ? void 0 : _b['platform']) === 'ADMIN') {
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
        }
    });
    if (snap.docs.length > 0) {
        await batch.commit();
    }
}
// --- LOGIQUE METIER MIKI (EQUIPEMENT) ---
exports.processEquipmentScan = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    const { equipmentId, action, tenantId, details } = data;
    const userId = context.auth.uid;
    await verifyAccess(userId, tenantId, ["AGENT", "TECHNICIAN", "MANAGER", "ADMIN"]);
    const [equipmentSnap, tenantSnap] = await Promise.all([
        db.collection("tenants").doc(tenantId).collection("equipments").doc(equipmentId).get(),
        db.collection("tenants").doc(tenantId).get(),
    ]);
    if (!equipmentSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Équipement introuvable.");
    }
    const eqData = equipmentSnap.data();
    if ((details === null || details === void 0 ? void 0 : details.validationQr) && (eqData === null || eqData === void 0 ? void 0 : eqData.qrCode) && eqData.qrCode !== details.validationQr) {
        throw new functions.https.HttpsError("permission-denied", "Le QR Code scanné ne correspond pas à l'équipement.");
    }
    return db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        if (!userData)
            throw new functions.https.HttpsError("not-found", "Utilisateur introuvable.");
        const now = admin.firestore.Timestamp.now();
        const logRecord = {
            tenantId,
            equipmentId,
            userId,
            timestamp: new Date().toISOString(),
            action,
            isOffline: false,
            isManual: false,
            source: "SCAN",
            userNote: details === null || details === void 0 ? void 0 : details.userNote,
            agentNameSnapshot: `${userData.firstName} ${userData.lastName}`,
            equipmentNameSnapshot: (eqData === null || eqData === void 0 ? void 0 : eqData.name) || "Inconnu",
            serverTimestamp: now,
        };
        if (details === null || details === void 0 ? void 0 : details.siteId)
            logRecord.siteId = details.siteId;
        let newStatus = (eqData === null || eqData === void 0 ? void 0 : eqData.status) || "AVAILABLE";
        let userUpdates = {};
        let eqUpdates = { lastUsageTimestamp: new Date().toISOString() };
        let childrenRefs = [];
        let childrenSnaps = [];
        if ((eqData === null || eqData === void 0 ? void 0 : eqData.isKit) && Array.isArray(eqData.childEquipmentIds)) {
            childrenRefs = eqData.childEquipmentIds.map((id) => db.collection("tenants").doc(tenantId).collection("equipments").doc(id));
            if (childrenRefs.length > 0) {
                childrenSnaps = await transaction.getAll(...childrenRefs);
            }
        }
        let createdMaintenanceReport = null;
        switch (action) {
            case 'TAKE':
                if (newStatus === "MAINTENANCE")
                    throw new functions.https.HttpsError("failed-precondition", "Équipement en maintenance.");
                if (eqData === null || eqData === void 0 ? void 0 : eqData.isBatch) {
                    const qty = (details === null || details === void 0 ? void 0 : details.quantity) || 1;
                    if (qty > (eqData.batchQuantity || 0))
                        throw new functions.https.HttpsError("out-of-range", "Stock insuffisant.");
                    eqUpdates.batchQuantity = admin.firestore.FieldValue.increment(-qty);
                    logRecord.batchQuantityChange = -qty;
                }
                else {
                    if (newStatus === "IN_USE")
                        throw new functions.https.HttpsError("failed-precondition", "Équipement déjà emprunté.");
                    newStatus = "IN_USE";
                    userUpdates.activeEquipmentId = equipmentId;
                    if (details === null || details === void 0 ? void 0 : details.siteId)
                        eqUpdates.currentSiteId = details.siteId;
                }
                eqUpdates.usageCount = admin.firestore.FieldValue.increment(1);
                break;
            case 'RETURN':
                if (eqData === null || eqData === void 0 ? void 0 : eqData.isBatch) {
                    const qty = (details === null || details === void 0 ? void 0 : details.quantity) || 1;
                    eqUpdates.batchQuantity = admin.firestore.FieldValue.increment(qty);
                    logRecord.batchQuantityChange = qty;
                }
                else {
                    newStatus = "AVAILABLE";
                    userUpdates.activeEquipmentId = null;
                    eqUpdates.currentSiteId = admin.firestore.FieldValue.delete();
                }
                // Maintenance Prédictive Check
                let triggersMaintenance = false;
                let expectedUsageCount = ((eqData === null || eqData === void 0 ? void 0 : eqData.usageCount) || 0) + 1;
                if ((eqData === null || eqData === void 0 ? void 0 : eqData.usageCountBeforeMaintenance) && expectedUsageCount >= eqData.usageCountBeforeMaintenance) {
                    triggersMaintenance = true;
                }
                if ((eqData === null || eqData === void 0 ? void 0 : eqData.nextMaintenanceDate) && new Date(eqData.nextMaintenanceDate) <= new Date()) {
                    triggersMaintenance = true;
                }
                if (triggersMaintenance && !(eqData === null || eqData === void 0 ? void 0 : eqData.isBatch)) {
                    newStatus = "MAINTENANCE";
                    const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc();
                    createdMaintenanceReport = {
                        id: reportRef.id,
                        tenantId,
                        equipmentId,
                        userId: "SYSTEM",
                        userNameSnapshot: "Système de Maintenance Prédictive",
                        equipmentNameSnapshot: (eqData === null || eqData === void 0 ? void 0 : eqData.name) || "Inconnu",
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
                if (eqData === null || eqData === void 0 ? void 0 : eqData.maintenanceIntervalDays) {
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
        if (Object.keys(userUpdates).length > 0)
            transaction.update(userRef, userUpdates);
        // Update Children if Kit
        if ((eqData === null || eqData === void 0 ? void 0 : eqData.isKit) && childrenSnaps.length > 0) {
            childrenSnaps.forEach(snap => {
                if (snap.exists) {
                    let childUpdates = { status: action === 'TAKE' ? 'IN_USE' : 'AVAILABLE' };
                    if (action === 'TAKE' && (details === null || details === void 0 ? void 0 : details.siteId))
                        childUpdates.currentSiteId = details.siteId;
                    if (action === 'RETURN')
                        childUpdates.currentSiteId = admin.firestore.FieldValue.delete();
                    transaction.update(snap.ref, childUpdates);
                }
            });
        }
        return { id: logRef.id, logRecord, createdMaintenanceReport };
    }).then(async (result) => {
        // Post-transaction tasks
        if (result.createdMaintenanceReport) {
            await createManagerNotification(tenantId, `Maintenance Préventive Requise`, `L'équipement ${eqData === null || eqData === void 0 ? void 0 : eqData.name} a atteint son seuil de révision.`, "WARNING");
        }
        return result;
    });
});
exports.deleteEquipmentLog = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Action interdite.");
    const { tenantId, logId } = data;
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    await db.collection("tenants").doc(tenantId).collection("equipmentLogs").doc(logId).delete();
    return { success: true };
});
// --- GESTION UTILISATEURS ---
// Le code manageUser existant reste valide car il gère des attributs génériques
exports.manageUser = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, userData, targetUserId } = data;
    if (action === "UPDATE" && targetUserId === context.auth.uid) {
        const keys = Object.keys(userData || {});
        if (keys.length === 1 && keys[0] === "mustChangePassword" && userData.mustChangePassword === false) {
            await db.collection("users").doc(targetUserId).update({ mustChangePassword: false });
            return { success: true };
        }
    }
    const { isGlobalAdmin } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    if (action === "CREATE") {
        const tempPassword = Math.random().toString(36).slice(-8);
        const normalizedRole = typeof (userData === null || userData === void 0 ? void 0 : userData.role) === "string" ? userData.role.toUpperCase() : null;
        if (!normalizedRole)
            throw new functions.https.HttpsError("invalid-argument", "Rôle requis.");
        const created = await auth.createUser({
            email: userData.email,
            password: tempPassword,
            displayName: `${userData.firstName} ${userData.lastName}`,
        });
        await db.collection("users").doc(created.uid).set(Object.assign(Object.assign({}, userData), { role: normalizedRole, id: created.uid, isArchived: false, isDisabled: false, mustChangePassword: true, tenantsAccess: { [tenantId]: normalizedRole }, accessibleTenantIds: [tenantId] }), { merge: true });
        return { uid: created.uid, password: tempPassword };
    }
    if (action === "UPDATE" || action === "RESET_PASSWORD") {
        const targetRef = db.collection("users").doc(targetUserId);
        const targetSnap = await targetRef.get();
        if (!targetSnap.exists)
            throw new functions.https.HttpsError("not-found", "User not found");
        const targetData = targetSnap.data();
        if (((_a = targetData === null || targetData === void 0 ? void 0 : targetData.tenantsAccess) === null || _a === void 0 ? void 0 : _a["platform"]) === "ADMIN" && !isGlobalAdmin) {
            throw new functions.https.HttpsError("permission-denied", "Platform admin update denied.");
        }
        if (action === "UPDATE") {
            const cleanData = JSON.parse(JSON.stringify(userData));
            await targetRef.update(cleanData);
            if (cleanData.isDisabled !== undefined) {
                await auth.updateUser(targetUserId, { disabled: cleanData.isDisabled });
            }
            return { success: true };
        }
        if (action === "RESET_PASSWORD") {
            const tempPassword = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
            await auth.updateUser(targetUserId, { password: tempPassword });
            await targetRef.update({ mustChangePassword: true });
            return { success: true, tempPassword };
        }
    }
    return { success: false };
});
exports.manageEquipment = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    if (action === "CREATE") {
        const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
        await ref.set(Object.assign(Object.assign({}, payload), { id: ref.id, tenantId, qrCode: generateSecureQR(), status: payload.status || "AVAILABLE", usageCount: 0, isArchived: false }));
        return { success: true, id: ref.id };
    }
    if (action === "CREATE_BATCH") {
        const { items } = payload;
        const batch = db.batch();
        const ids = [];
        for (const item of items) {
            const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
            batch.set(ref, Object.assign(Object.assign({}, item), { id: ref.id, tenantId, qrCode: generateSecureQR(), status: item.status || "AVAILABLE", usageCount: 0, isArchived: false }));
            ids.push(ref.id);
        }
        await batch.commit();
        return { success: true, ids };
    }
    if (action === "UPDATE") {
        const _a = payload.updates, { qrCode, id } = _a, safeUpdates = __rest(_a, ["qrCode", "id"]);
        await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).update(safeUpdates);
        return { success: true };
    }
    if (action === "RENEW_QR") {
        const qr = generateSecureQR();
        await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).update({ qrCode: qr });
        return { success: true };
    }
    if (action === "ARCHIVE") {
        await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).update({
            isArchived: true,
            status: "ARCHIVED"
        });
        return { success: true };
    }
    return { success: false };
});
exports.manageStructure = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    const { action, tenantId, payload } = data;
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    if (action === "CREATE_TENANT") {
        const ref = db.collection("tenants").doc();
        await ref.set(Object.assign(Object.assign({ id: ref.id }, payload), { status: "ACTIVE", createdAt: admin.firestore.FieldValue.serverTimestamp() }));
        return { id: ref.id };
    }
    if (action === "UPDATE_TENANT") {
        await db.collection("tenants").doc(tenantId).update(payload);
        return { success: true };
    }
    return { success: false };
});
exports.manageSite = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    const { action, tenantId, payload } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const coll = db.collection("tenants").doc(tenantId).collection("sites");
    if (action === "CREATE") {
        const ref = await coll.add(Object.assign(Object.assign({}, payload), { isArchived: false, createdAt: new Date().toISOString() }));
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
exports.submitReport = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    const { incidentReport, tenantId, action } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    if (action === "ARCHIVE") {
        await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
        await db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id).update({ status: "ARCHIVED" });
        return { success: true };
    }
    if (action === "UPDATE_STATUS") {
        await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "MANAGER", "ADMIN"]);
        const updateData = { status: incidentReport.status };
        if (incidentReport.assignedTo !== undefined)
            updateData.assignedTo = incidentReport.assignedTo;
        await db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id).update(updateData);
        // If resolved, maybe the technician has also verified the equipment, but we let the user scan the equipment to really make it available again or we can do it here. 
        // For now, just update the ticket.
        return { success: true };
    }
    await verifyAccess(context.auth.uid, tenantId, ["AGENT", "TECHNICIAN", "MANAGER", "ADMIN"]);
    // Creation de Ticket
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(incidentReport.equipmentId).get();
    const record = Object.assign(Object.assign({}, incidentReport), { userId: context.auth.uid, userNameSnapshot: `${userData === null || userData === void 0 ? void 0 : userData.firstName} ${userData === null || userData === void 0 ? void 0 : userData.lastName}`, equipmentNameSnapshot: ((_a = eqSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || "Inconnu", status: "OPEN", timestamp: new Date().toISOString(), serverTimestamp: admin.firestore.Timestamp.now() });
    const ref = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(record);
    // Auto-update eq status if not batch
    if (!((_b = eqSnap.data()) === null || _b === void 0 ? void 0 : _b.isBatch)) {
        await eqSnap.ref.update({ status: 'MAINTENANCE' });
    }
    await createManagerNotification(tenantId, `Nouvel Incident Signalé: ${incidentReport.priority}`, `L'équipement ${((_c = eqSnap.data()) === null || _c === void 0 ? void 0 : _c.name) || "Inconnu"} requiert une attention.`, incidentReport.priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
    return { id: ref.id };
});
exports.manageChecklist = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    const { tenantId, action, payload } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const coll = db.collection("tenants").doc(tenantId).collection("checklists");
    if (action === "CREATE") {
        const ref = await coll.add(Object.assign(Object.assign({}, payload), { isArchived: false }));
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
exports.submitChecklistAnswers = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    const { tenantId, payload } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["AGENT", "TECHNICIAN", "MANAGER", "ADMIN"]);
    // If there is an incident report to create (failed trigger item)
    if (payload.incidentReportData) {
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        const userData = userDoc.data();
        const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.incidentReportData.equipmentId).get();
        const incidentRecord = Object.assign(Object.assign({}, payload.incidentReportData), { userId: context.auth.uid, userNameSnapshot: `${userData === null || userData === void 0 ? void 0 : userData.firstName} ${userData === null || userData === void 0 ? void 0 : userData.lastName}`, equipmentNameSnapshot: ((_a = eqSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || "Inconnu", status: "OPEN", timestamp: new Date().toISOString(), serverTimestamp: admin.firestore.Timestamp.now() });
        const incidentRef = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(incidentRecord);
        payload.ticketId = incidentRef.id;
        if (!((_b = eqSnap.data()) === null || _b === void 0 ? void 0 : _b.isBatch)) {
            await eqSnap.ref.update({ status: 'MAINTENANCE' });
        }
        await createManagerNotification(tenantId, `Étape de Checklist Échouée`, `Sur l'équipement ${((_c = eqSnap.data()) === null || _c === void 0 ? void 0 : _c.name) || "Inconnu"}. Intervention bloquante signalée.`, "CRITICAL");
    }
    const record = Object.assign(Object.assign({}, payload), { incidentReportData: admin.firestore.FieldValue.delete(), userId: context.auth.uid, timestamp: new Date().toISOString(), serverTimestamp: admin.firestore.Timestamp.now() });
    const ref = await db.collection("tenants").doc(tenantId).collection("maintenanceLogs").add(record);
    return { id: ref.id };
});
exports.seedSystem = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    // Basic seeding
    const email = "admin@miki.nc";
    const password = "password123";
    let uid = "";
    try {
        const user = await auth.getUserByEmail(email);
        uid = user.uid;
        await auth.updateUser(uid, { password, disabled: false });
    }
    catch (_a) {
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
exports.repairAdminProfile = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    await db.collection("users").doc(context.auth.uid).set({
        tenantsAccess: { platform: "ADMIN" }, role: "ADMIN", accessibleTenantIds: admin.firestore.FieldValue.arrayUnion("platform"),
    }, { merge: true });
    return { success: true };
});
exports.nukePlatform = functions
    .region("australia-southeast1")
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onCall(async (data, context) => {
    return { success: false, message: "Disabled for safety." };
});
//# sourceMappingURL=index.js.map