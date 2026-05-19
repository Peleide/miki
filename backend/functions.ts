import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

/**
 * Vérifie les permissions d'un utilisateur pour un tenant donné.
 */
async function verifyAccess(uid: string, tenantId: string, allowedRoles: string[]) {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    
    if (!userData) {
        throw new functions.https.HttpsError('not-found', "Profil utilisateur introuvable.");
    }

    if (userData.isDisabled) {
        throw new functions.https.HttpsError('permission-denied', "Compte désactivé.");
    }

    if (userData.tenantsAccess?.['platform'] === 'ADMIN') {
        return { user: userData, isGlobalAdmin: true };
    }

    const role = userData.tenantsAccess?.[tenantId];
    if (!role || !allowedRoles.includes(role)) {
        throw new functions.https.HttpsError('permission-denied', "Accès refusé pour ce site.");
    }
    
    return { user: userData, isGlobalAdmin: false };
}

// 1. POINTAGE
export const addCheckIn = functions.region('australia-southeast1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', "Authentification requise.");
    const { usageLog, tenantId } = data;
    const userId = context.auth.uid;

    await verifyAccess(userId, tenantId, ['AGENT', 'MANAGER', 'ADMIN']);

    const roomRef = db.collection('tenants').doc(tenantId).collection('equipments').doc(usageLog.equipmentId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) throw new functions.https.HttpsError('not-found', "Salle inexistante.");
    
    const roomData = roomSnap.data();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    const checkInRecord = {
        ...usageLog,
        userId: userId,
        agentNameSnapshot: `${userData?.firstName} ${userData?.lastName}`,
        roomNameSnapshot: roomData?.name || 'Inconnue',
        brandId: roomData?.brandId || '',
        clientTimestamp: usageLog.timestamp,
        serverTimestamp: admin.firestore.Timestamp.now(),
        isAuditValid: true
    };

    return await db.runTransaction(async (transaction) => {
        const checkInRef = db.collection('tenants').doc(tenantId).collection('usageLogs').doc();
        transaction.set(checkInRef, checkInRecord);
        const agentRef = db.collection('users').doc(userId);
        if (usageLog.type === 'START') {
            transaction.update(agentRef, { activeSessionId: usageLog.sessionId, activeRoomId: usageLog.equipmentId });
        } else {
            transaction.update(agentRef, { activeSessionId: null, activeRoomId: null });
        }
        return { id: checkInRef.id, ...checkInRecord };
    });
});

// 2. UTILISATEURS
export const manageUser = functions.region('australia-southeast1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', "Authentification requise.");
    const { action, tenantId, userData, targetUserId } = data;
    await verifyAccess(context.auth.uid, tenantId, ['MANAGER', 'ADMIN']);

    if (action === 'CREATE') {
        let uid: string;
        const tempPassword = Math.random().toString(36).slice(-8);
        try {
            const userRecord = await auth.createUser({
                email: userData.email,
                password: tempPassword,
                displayName: `${userData.firstName} ${userData.lastName}`
            });
            uid = userRecord.uid;
        } catch (e: any) {
            if (e.code === 'auth/email-already-exists') {
                const userRecord = await auth.getUserByEmail(userData.email);
                uid = userRecord.uid;
            } else throw new functions.https.HttpsError('internal', e.message);
        }

        const userRef = db.collection('users').doc(uid);
        const currentDoc = await userRef.get();
        const currentData = currentDoc.data();
        const updatedAccess = { ...(currentData?.tenantsAccess || {}), [tenantId]: userData.role };
        const updatedTenants = Array.from(new Set([...(currentData?.accessibleTenantIds || []), tenantId]));

        if (!currentDoc.exists) {
            await userRef.set({ ...userData, id: uid, isArchived: false, isDisabled: false, mustChangePassword: true, tenantsAccess: updatedAccess, accessibleTenantIds: updatedTenants });
        } else {
            await userRef.update({ tenantsAccess: updatedAccess, accessibleTenantIds: updatedTenants });
        }
        return { uid, password: currentDoc.exists ? "Déjà existant" : tempPassword };
    }

    if (action === 'UPDATE' && targetUserId) {
        await db.collection('users').doc(targetUserId).update(userData);
        if (userData.isDisabled !== undefined) await auth.updateUser(targetUserId, { disabled: userData.isDisabled });
        return { success: true };
    }
    return { success: false };
});

// 3. STRUCTURE
export const manageStructure = functions.region('australia-southeast1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', "Authentification requise.");
    const { action, tenantId, payload } = data;
    await verifyAccess(context.auth.uid, tenantId, ['MANAGER', 'ADMIN']);

    if (action === 'CREATE_ROOM') {
        const ref = db.collection('tenants').doc(tenantId).collection('equipments').doc();
        const roomData = { ...payload, id: ref.id, qrCode: `MIKI_${Math.random().toString(36).substr(2, 8).toUpperCase()}`, isArchived: false };
        await ref.set(roomData);
        return roomData;
    }
    if (action === 'UPDATE_ROOM') {
        await db.collection('tenants').doc(tenantId).collection('equipments').doc(payload.id).update(payload.updates);
        return { success: true };
    }
    return { success: false };
});

// 4. SIGNALEMENTS
export const submitReport = functions.region('australia-southeast1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', "Authentification requise.");
    const { incidentReport, tenantId } = data;
    await verifyAccess(context.auth.uid, tenantId, ['AGENT', 'MANAGER', 'ADMIN', 'CLIENT']);
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    const roomSnap = await db.collection('tenants').doc(tenantId).collection('equipments').doc(incidentReport.equipmentId).get();
    const reportRecord = { ...incidentReport, userId: context.auth.uid, userNameSnapshot: `${userData?.firstName} ${userData?.lastName}`, roomNameSnapshot: roomSnap.data()?.name || 'Inconnue', status: 'OPEN', timestamp: new Date().toISOString(), serverTimestamp: admin.firestore.Timestamp.now() };
    const ref = await db.collection('tenants').doc(tenantId).collection('incidentReports').add(reportRecord);
    return { id: ref.id, ...reportRecord };
});