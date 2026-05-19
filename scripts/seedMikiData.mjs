import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

let app;

try {
    const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
    app = initializeApp({
        credential: cert(serviceAccount)
    });
} catch (e) {
    console.error("Erreur de lecture de service-account.json:", e.message);
    process.exit(1);
}

const auth = getAuth(app);
const db = getFirestore(app);

const TENANT_ID = 'TEST_TENANT_1';

async function createUser(email, password, role, firstName, lastName) {
    let userRecord;
    try {
        userRecord = await auth.getUserByEmail(email);
        await auth.updateUser(userRecord.uid, { password, displayName: `${firstName} ${lastName}` });
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            userRecord = await auth.createUser({
                email,
                password,
                displayName: `${firstName} ${lastName}`,
            });
        } else {
            throw e;
        }
    }

    const userRef = db.collection('users').doc(userRecord.uid);
    await userRef.set({
        firstName,
        lastName,
        email,
        role,
        tenantId: TENANT_ID,
        tenantsAccess: { [TENANT_ID]: role },
        accessibleTenantIds: [TENANT_ID]
    }, { merge: true });

    return userRecord.uid;
}

async function seedMikiData() {
    console.log("Seeding Miki tenant (TEST_TENANT_1) data...");

    // 1. Rename tenant to 'Miki' for clarity
    await db.collection('tenants').doc(TENANT_ID).set({
        name: 'Miki',
        quotas: { users: 50, equipments: 500 },
        timezone: 'Pacific/Noumea',
        status: 'ACTIVE'
    }, { merge: true });

    // 2. Insert Users
    const agent1Id = await createUser('agent1@miki.nc', 'agentMiki123!', 'AGENT', 'Agent', 'Un');
    const agent2Id = await createUser('agent2@miki.nc', 'agentMiki123!', 'AGENT', 'Agent', 'Deux');
    const techId = await createUser('tech1@miki.nc', 'techMiki123!', 'TECHNICIAN', 'Tech', 'Un');
    console.log("Utilisateurs insérés.");

    // 3. Insert Sites
    const siteAlphaRef = db.collection('tenants').doc(TENANT_ID).collection('sites').doc('site_alpha');
    await siteAlphaRef.set({
        name: 'Chantier Alpha - Nouméa',
        address: 'Centre-ville',
        status: 'ACTIVE',
        createdAt: Timestamp.now()
    });

    const siteBetaRef = db.collection('tenants').doc(TENANT_ID).collection('sites').doc('site_beta');
    await siteBetaRef.set({
        name: 'Chantier Beta - Koné',
        address: 'Zone Nord',
        status: 'ACTIVE',
        createdAt: Timestamp.now()
    });
    console.log("Chantiers insérés.");

    // 4. Insert Equipments
    const eqCollection = db.collection('tenants').doc(TENANT_ID).collection('equipments');
    
    // Unitary equipment
    await eqCollection.doc('eq_drill').set({
        name: 'Perceuse Bosch',
        brand: 'Bosch',
        model: 'Pro 18V',
        status: 'AVAILABLE',
        isBatch: false,
        qrCode: 'QR_DRILL_001',
        category: 'Outillage électroportatif',
        usageCount: 8,
        usageCountBeforeMaintenance: 10,
        createdAt: Timestamp.now(),
        lastUsageTimestamp: new Date().toISOString()
    });

    // Batch equipment
    await eqCollection.doc('eq_helmet').set({
        name: 'Casques de protection',
        brand: 'MSA',
        model: 'V-Gard',
        status: 'AVAILABLE',
        isBatch: true,
        batchQuantity: 50,
        qrCode: 'QR_HELMET_BATCH',
        category: 'EPI',
        createdAt: Timestamp.now()
    });

    // Components for Kit
    await eqCollection.doc('eq_weld_mask').set({
        name: 'Masque de Soudure Automatique',
        brand: 'Optrel',
        model: 'Panoramaxx',
        status: 'AVAILABLE',
        isBatch: false,
        qrCode: 'QR_WELD_MASK',
        category: 'EPI',
        parentId: 'eq_weld_kit',
        createdAt: Timestamp.now()
    });

    await eqCollection.doc('eq_weld_machine').set({
        name: 'Poste à souder TIG',
        brand: 'Kemppi',
        model: 'MasterTig',
        status: 'AVAILABLE',
        isBatch: false,
        qrCode: 'QR_WELD_MACHINE',
        category: 'Outil Spécialisé',
        parentId: 'eq_weld_kit',
        createdAt: Timestamp.now()
    });

    // Kit Parent
    await eqCollection.doc('eq_weld_kit').set({
        name: 'Kit Complet Soudeur',
        brand: 'Miki Sets',
        model: 'V1',
        status: 'AVAILABLE',
        isBatch: false,
        isKit: true,
        childEquipmentIds: ['eq_weld_mask', 'eq_weld_machine'],
        qrCode: 'QR_WELD_KIT',
        category: 'Ensemble',
        createdAt: Timestamp.now()
    });
    console.log("Équipements et kits insérés.");

    // 5. Insert Incident Report (for technician)
    const reportRef = db.collection('tenants').doc(TENANT_ID).collection('incident_reports').doc('inc_001');
    await reportRef.set({
        equipmentId: 'eq_drill',
        userId: agent1Id,
        userNameSnapshot: 'Agent Un',
        equipmentNameSnapshot: 'Perceuse Bosch',
        message: 'Le mandrin est bloqué, impossible de changer le foret.',
        tags: ['Panne', 'Mécanique'],
        status: 'OPEN',
        timestamp: new Date().toISOString(),
        serverTimestamp: Timestamp.now()
    });
    console.log("Rapports d'incident générés.");

    console.log("Peuplement terminé avec succès !");
    process.exit(0);
}

seedMikiData().catch(e => {
    console.error(e);
    process.exit(1);
});
