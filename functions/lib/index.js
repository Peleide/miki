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
exports.nukePlatform = exports.repairAdminProfile = exports.seedSystem = exports.manageVisitSession = exports.manageCdilUnit = exports.manageEquipmentType = exports.submitChecklistAnswers = exports.manageChecklist = exports.submitReport = exports.manageSite = exports.manageStructure = exports.manageEquipment = exports.manageUser = exports.deleteEquipmentLog = exports.processEquipmentScan = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
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
    const [tenantSnap, platformSnap] = await Promise.all([
        db.collection("users").where("accessibleTenantIds", "array-contains", tenantId).get(),
        db.collection("users").where("accessibleTenantIds", "array-contains", "platform").get(),
    ]);
    // Merge, dedup by doc ID
    const seen = new Set();
    const allDocs = [];
    for (const doc of [...tenantSnap.docs, ...platformSnap.docs]) {
        if (!seen.has(doc.id)) {
            seen.add(doc.id);
            allDocs.push(doc);
        }
    }
    const batch = db.batch();
    let count = 0;
    allDocs.forEach(doc => {
        var _a, _b;
        const data = doc.data();
        const role = ((_a = data.tenantsAccess) === null || _a === void 0 ? void 0 : _a[tenantId]) || data.role;
        const isPlatformAdmin = ((_b = data.tenantsAccess) === null || _b === void 0 ? void 0 : _b['platform']) === 'ADMIN';
        if (role === 'MANAGER' || role === 'ADMIN' || role === 'TECHNICIAN' || isPlatformAdmin) {
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
    if (count > 0)
        await batch.commit();
}
async function writeAuditLog(params) {
    var _a;
    const category = params.action.startsWith('USER') ? 'USER' : 'STRUCTURE';
    let tenantName = params.tenantId;
    try {
        const tenantSnap = await db.collection("tenants").doc(params.tenantId).get();
        if (tenantSnap.exists)
            tenantName = ((_a = tenantSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || params.tenantId;
    }
    catch ( /* use tenantId as fallback */_b) { /* use tenantId as fallback */ }
    const detailsStr = params.details
        ? Object.entries(params.details)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' · ')
        : undefined;
    const ref = db.collection("audit_logs").doc();
    return ref.set(Object.assign(Object.assign(Object.assign({ id: ref.id, timestamp: new Date().toISOString(), serverTimestamp: firestore_1.Timestamp.now(), userId: params.actorId, userName: params.actorName, action: params.action, category, tenantId: params.tenantId, tenantName }, (params.targetId ? { targetId: params.targetId } : {})), (params.targetName ? { targetName: params.targetName } : {})), (detailsStr ? { details: detailsStr } : {})));
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
        var _a, _b, _c;
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        if (!userData)
            throw new functions.https.HttpsError("not-found", "Utilisateur introuvable.");
        const now = firestore_1.Timestamp.now();
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
                    eqUpdates.batchQuantity = firestore_1.FieldValue.increment(-qty);
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
                eqUpdates.usageCount = firestore_1.FieldValue.increment(1);
                break;
            case 'RETURN':
                if (eqData === null || eqData === void 0 ? void 0 : eqData.isBatch) {
                    const qty = (details === null || details === void 0 ? void 0 : details.quantity) || 1;
                    const batchTotal = (_b = (_a = eqData.batchTotal) !== null && _a !== void 0 ? _a : eqData.batchQuantity) !== null && _b !== void 0 ? _b : 0;
                    const currentQty = (_c = eqData.batchQuantity) !== null && _c !== void 0 ? _c : 0;
                    if (currentQty + qty > batchTotal) {
                        throw new functions.https.HttpsError("out-of-range", `Impossible de restituer ${qty} unité(s) : le stock total est de ${batchTotal}.`);
                    }
                    eqUpdates.batchQuantity = firestore_1.FieldValue.increment(qty);
                    logRecord.batchQuantityChange = qty;
                }
                else {
                    newStatus = "AVAILABLE";
                    userUpdates.activeEquipmentId = null;
                    eqUpdates.currentSiteId = firestore_1.FieldValue.delete();
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
                        childUpdates.currentSiteId = firestore_1.FieldValue.delete();
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
    const { isGlobalAdmin, user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;
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
        writeAuditLog({ action: 'USER_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: created.uid, targetName: `${userData.firstName} ${userData.lastName}`, details: { role: normalizedRole, email: userData.email } }).catch(console.error);
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
            const auditAction = cleanData.isDisabled === true ? 'USER_DISABLED' : cleanData.isDisabled === false ? 'USER_ENABLED' : 'USER_UPDATED';
            const targetName = `${targetData === null || targetData === void 0 ? void 0 : targetData.firstName} ${targetData === null || targetData === void 0 ? void 0 : targetData.lastName}`;
            writeAuditLog({ action: auditAction, actorId: context.auth.uid, actorName, tenantId, targetId: targetUserId, targetName, details: cleanData }).catch(console.error);
            return { success: true };
        }
        if (action === "RESET_PASSWORD") {
            const tempPassword = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10);
            await auth.updateUser(targetUserId, { password: tempPassword });
            await targetRef.update({ mustChangePassword: true });
            writeAuditLog({ action: 'USER_PASSWORD_RESET', actorId: context.auth.uid, actorName, tenantId, targetId: targetUserId, targetName: `${targetData === null || targetData === void 0 ? void 0 : targetData.firstName} ${targetData === null || targetData === void 0 ? void 0 : targetData.lastName}` }).catch(console.error);
            return { success: true, tempPassword };
        }
    }
    return { success: false };
});
exports.manageEquipment = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;
    if (action === "CREATE") {
        const counterRef = db.collection("tenants").doc(tenantId).collection("counters").doc("equipmentTypeCounters");
        if (payload.categoryCode && payload.storageLocation) {
            const result = await db.runTransaction(async (tx) => {
                var _a, _b;
                const counterSnap = await tx.get(counterRef);
                const counters = counterSnap.exists ? counterSnap.data() || {} : {};
                const newCount = (counters[payload.categoryCode] || 0) + 1;
                const now = new Date();
                const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                const name = `${payload.categoryCode}${String(newCount).padStart(2, '0')}_${yyyymm}_${payload.storageLocation}`;
                const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc();
                tx.set(eqRef, Object.assign(Object.assign(Object.assign({}, payload), { id: eqRef.id, tenantId,
                    name, type: payload.category || payload.categoryCode, qrCode: generateSecureQR(), status: payload.status || "AVAILABLE", usageCount: 0, isArchived: false, createdAt: new Date().toISOString() }), (payload.isBatch ? { batchTotal: (_b = (_a = payload.batchTotal) !== null && _a !== void 0 ? _a : payload.batchQuantity) !== null && _b !== void 0 ? _b : 0 } : {})));
                tx.set(counterRef, { [payload.categoryCode]: newCount }, { merge: true });
                return { success: true, id: eqRef.id, name };
            });
            writeAuditLog({ action: 'EQUIPMENT_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: result.id, targetName: result.name, details: { category: payload.categoryCode, isBatch: payload.isBatch } }).catch(console.error);
            return result;
        }
        const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
        await ref.set(Object.assign(Object.assign(Object.assign({}, payload), { id: ref.id, tenantId, qrCode: generateSecureQR(), status: payload.status || "AVAILABLE", usageCount: 0, isArchived: false, createdAt: new Date().toISOString() }), (payload.isBatch ? { batchTotal: (_b = (_a = payload.batchTotal) !== null && _a !== void 0 ? _a : payload.batchQuantity) !== null && _b !== void 0 ? _b : 0 } : {})));
        writeAuditLog({ action: 'EQUIPMENT_CREATED', actorId: context.auth.uid, actorName, tenantId, targetId: ref.id, details: { category: payload.categoryCode, isBatch: payload.isBatch } }).catch(console.error);
        return { success: true, id: ref.id };
    }
    if (action === "CREATE_BATCH") {
        const { items } = payload;
        const counterRef = db.collection("tenants").doc(tenantId).collection("counters").doc("equipmentTypeCounters");
        const firstItem = items[0];
        if ((firstItem === null || firstItem === void 0 ? void 0 : firstItem.categoryCode) && (firstItem === null || firstItem === void 0 ? void 0 : firstItem.storageLocation)) {
            return await db.runTransaction(async (tx) => {
                const counterSnap = await tx.get(counterRef);
                const counters = counterSnap.exists ? counterSnap.data() || {} : {};
                let count = counters[firstItem.categoryCode] || 0;
                const ids = [];
                const now = new Date();
                const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
                for (const item of items) {
                    count++;
                    const name = `${item.categoryCode}${String(count).padStart(2, '0')}_${yyyymm}_${item.storageLocation}`;
                    const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc();
                    tx.set(eqRef, Object.assign(Object.assign({}, item), { id: eqRef.id, tenantId,
                        name, type: item.category || item.categoryCode, qrCode: generateSecureQR(), status: item.status || "AVAILABLE", usageCount: 0, isArchived: false, createdAt: new Date().toISOString() }));
                    ids.push(eqRef.id);
                }
                tx.set(counterRef, { [firstItem.categoryCode]: count }, { merge: true });
                return { success: true, ids };
            });
        }
        const batch = db.batch();
        const ids = [];
        for (const item of items) {
            const ref = db.collection("tenants").doc(tenantId).collection("equipments").doc();
            batch.set(ref, Object.assign(Object.assign({}, item), { id: ref.id, tenantId, qrCode: generateSecureQR(), status: item.status || "AVAILABLE", usageCount: 0, isArchived: false, createdAt: new Date().toISOString() }));
            ids.push(ref.id);
        }
        await batch.commit();
        return { success: true, ids };
    }
    if (action === "UPDATE") {
        const _d = payload.updates, { qrCode, id } = _d, safeUpdates = __rest(_d, ["qrCode", "id"]);
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
    if (action === "ARCHIVE") {
        const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(payload.id).get();
        await eqSnap.ref.update({ isArchived: true, status: "ARCHIVED" });
        writeAuditLog({ action: 'EQUIPMENT_ARCHIVED', actorId: context.auth.uid, actorName, tenantId, targetId: payload.id, targetName: (_c = eqSnap.data()) === null || _c === void 0 ? void 0 : _c.name }).catch(console.error);
        return { success: true };
    }
    return { success: false };
});
exports.manageStructure = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    const { action, tenantId, payload } = data;
    const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const actorName = `${actorData.firstName} ${actorData.lastName}`;
    if (action === "CREATE_TENANT") {
        const ref = db.collection("tenants").doc();
        await ref.set(Object.assign(Object.assign({ id: ref.id }, payload), { status: "ACTIVE", createdAt: firestore_1.FieldValue.serverTimestamp() }));
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
    var _a, _b, _c, _d;
    const { incidentReport, tenantId, action } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    if (action === "ARCHIVE") {
        const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
        const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id);
        const reportSnap = await reportRef.get();
        await reportRef.update({ status: "ARCHIVED" });
        writeAuditLog({ action: 'TICKET_ARCHIVED', actorId: context.auth.uid, actorName: `${actorData.firstName} ${actorData.lastName}`, tenantId, targetId: incidentReport.id, targetName: (_a = reportSnap.data()) === null || _a === void 0 ? void 0 : _a.equipmentNameSnapshot }).catch(console.error);
        return { success: true };
    }
    if (action === "UPDATE_STATUS") {
        const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["TECHNICIAN", "MANAGER", "ADMIN"]);
        const updateData = { status: incidentReport.status };
        if (incidentReport.assignedTo !== undefined)
            updateData.assignedTo = incidentReport.assignedTo;
        if (incidentReport.resolutionNote !== undefined)
            updateData.resolutionNote = incidentReport.resolutionNote;
        if (incidentReport.status === 'RESOLVED' || incidentReport.status === 'ARCHIVED') {
            updateData.resolutionTimestamp = new Date().toISOString();
        }
        const reportRef = db.collection("tenants").doc(tenantId).collection("incidentReports").doc(incidentReport.id);
        const reportSnap = await reportRef.get();
        const reportData = reportSnap.data();
        await reportRef.update(updateData);
        writeAuditLog({ action: 'TICKET_STATUS_CHANGED', actorId: context.auth.uid, actorName: `${actorData.firstName} ${actorData.lastName}`, tenantId, targetId: incidentReport.id, targetName: reportData === null || reportData === void 0 ? void 0 : reportData.equipmentNameSnapshot, details: { newStatus: incidentReport.status } }).catch(console.error);
        // Auto-update equipment traceability dates on resolution
        if (incidentReport.status === 'RESOLVED' && (reportData === null || reportData === void 0 ? void 0 : reportData.equipmentId)) {
            const eqRef = db.collection("tenants").doc(tenantId).collection("equipments").doc(reportData.equipmentId);
            const eqUpdates = {};
            const resolvedAt = new Date().toISOString();
            if (reportData.type === 'PERIODIC_MAINTENANCE') {
                eqUpdates.lastVisiteTechniqueDate = resolvedAt;
            }
            else if (reportData.type === 'BREAKDOWN' || reportData.type === 'DAMAGE') {
                eqUpdates.lastReparationDate = resolvedAt;
            }
            if (Object.keys(eqUpdates).length > 0) {
                await eqRef.update(eqUpdates);
            }
        }
        return { success: true };
    }
    await verifyAccess(context.auth.uid, tenantId, ["AGENT", "TECHNICIAN", "MANAGER", "ADMIN"]);
    // Creation de Ticket
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    const eqSnap = await db.collection("tenants").doc(tenantId).collection("equipments").doc(incidentReport.equipmentId).get();
    const record = Object.assign(Object.assign({}, incidentReport), { userId: context.auth.uid, userNameSnapshot: `${userData === null || userData === void 0 ? void 0 : userData.firstName} ${userData === null || userData === void 0 ? void 0 : userData.lastName}`, equipmentNameSnapshot: ((_b = eqSnap.data()) === null || _b === void 0 ? void 0 : _b.name) || "Inconnu", status: "OPEN", timestamp: new Date().toISOString(), serverTimestamp: firestore_1.Timestamp.now() });
    const ref = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(record);
    // Auto-update eq status if not batch
    if (!((_c = eqSnap.data()) === null || _c === void 0 ? void 0 : _c.isBatch)) {
        await eqSnap.ref.update({ status: 'MAINTENANCE' });
    }
    await createManagerNotification(tenantId, `Nouvel Incident Signalé: ${incidentReport.priority}`, `L'équipement ${((_d = eqSnap.data()) === null || _d === void 0 ? void 0 : _d.name) || "Inconnu"} requiert une attention.`, incidentReport.priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
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
        const incidentRecord = Object.assign(Object.assign({}, payload.incidentReportData), { userId: context.auth.uid, userNameSnapshot: `${userData === null || userData === void 0 ? void 0 : userData.firstName} ${userData === null || userData === void 0 ? void 0 : userData.lastName}`, equipmentNameSnapshot: ((_a = eqSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || "Inconnu", status: "OPEN", timestamp: new Date().toISOString(), serverTimestamp: firestore_1.Timestamp.now() });
        const incidentRef = await db.collection("tenants").doc(tenantId).collection("incidentReports").add(incidentRecord);
        payload.ticketId = incidentRef.id;
        if (!((_b = eqSnap.data()) === null || _b === void 0 ? void 0 : _b.isBatch)) {
            await eqSnap.ref.update({ status: 'MAINTENANCE' });
        }
        await createManagerNotification(tenantId, `Étape de Checklist Échouée`, `Sur l'équipement ${((_c = eqSnap.data()) === null || _c === void 0 ? void 0 : _c.name) || "Inconnu"}. Intervention bloquante signalée.`, "CRITICAL");
    }
    const record = Object.assign(Object.assign({}, payload), { incidentReportData: firestore_1.FieldValue.delete(), userId: context.auth.uid, timestamp: new Date().toISOString(), serverTimestamp: firestore_1.Timestamp.now() });
    const ref = await db.collection("tenants").doc(tenantId).collection("maintenanceLogs").add(record);
    return { id: ref.id };
});
exports.manageEquipmentType = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    const { action, tenantId, payload } = data;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN"]);
    const coll = db.collection("tenants").doc(tenantId).collection("equipmentTypes");
    if (action === "CREATE") {
        const ref = await coll.add(Object.assign(Object.assign({}, payload), { tenantId, isArchived: false, createdAt: new Date().toISOString() }));
        return { id: ref.id };
    }
    if (action === "ARCHIVE") {
        await coll.doc(payload.id).update({ isArchived: true });
        return { success: true };
    }
    return { success: false };
});
// --- CENTRALES DE DILUTION ---
exports.manageCdilUnit = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    const { user: actorData } = await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN", "TECHNICIAN"]);
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
        const { id } = payload, updates = __rest(payload, ["id"]);
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
exports.manageVisitSession = functions
    .region("australia-southeast1")
    .https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Auth required.");
    const { action, tenantId, payload } = data;
    await verifyAccess(context.auth.uid, tenantId, ["MANAGER", "ADMIN", "TECHNICIAN"]);
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();
    const technicianName = `${userData === null || userData === void 0 ? void 0 : userData.firstName} ${userData === null || userData === void 0 ? void 0 : userData.lastName}`;
    const coll = db.collection("tenants").doc(tenantId).collection("visitSessions");
    if (action === "CREATE") {
        const type = payload.type || "CDIL";
        const sessionType = payload.sessionType || "PERIODIQUE";
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
        if (!sessionSnap.exists)
            throw new functions.https.HttpsError("not-found", "Session introuvable.");
        const session = sessionSnap.data();
        if (session.status === "COMPLETED")
            throw new functions.https.HttpsError("failed-precondition", "Session déjà clôturée.");
        const now = new Date().toISOString();
        const batch = db.batch();
        // Mettre à jour chaque unité visitée avec son nouvel état
        for (const entry of session.entries) {
            if (!entry.unitId)
                continue;
            const unitRef = db.collection("tenants").doc(tenantId).collection("cdilUnits").doc(entry.unitId);
            batch.update(unitRef, Object.assign({ lastVisitDate: now, currentState: { buse: entry.buse, crepine: entry.crepine, ligne: entry.ligne } }, (entry.remarks ? { notes: entry.remarks } : {})));
        }
        // Clôturer la session
        batch.update(sessionRef, { status: "COMPLETED", completedAt: now });
        await batch.commit();
        writeAuditLog({ action: "VISIT_SESSION_COMPLETED", actorId: context.auth.uid, actorName: technicianName, tenantId, targetId: payload.sessionId, targetName: session.title, details: { type: session.type, unitCount: (_a = session.entries) === null || _a === void 0 ? void 0 : _a.length } }).catch(console.error);
        return { success: true };
    }
    if (action === "DELETE_DRAFT") {
        const sessionRef = coll.doc(payload.sessionId);
        const snap = await sessionRef.get();
        if (((_b = snap.data()) === null || _b === void 0 ? void 0 : _b.status) !== "DRAFT")
            throw new functions.https.HttpsError("failed-precondition", "Seules les sessions en brouillon peuvent être supprimées.");
        await sessionRef.delete();
        return { success: true };
    }
    return { success: false };
});
exports.seedSystem = functions
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
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    await verifyAccess(context.auth.uid, "platform", ["ADMIN"]);
    await db.collection("users").doc(context.auth.uid).set({
        tenantsAccess: { platform: "ADMIN" }, role: "ADMIN", accessibleTenantIds: firestore_1.FieldValue.arrayUnion("platform"),
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