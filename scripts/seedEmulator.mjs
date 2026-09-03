/**
 * Seed de l'émulateur Firebase local.
 * Ne nécessite pas de service-account.json.
 * Usage : node scripts/seedEmulator.mjs
 * (l'émulateur doit être lancé : firebase emulators:start)
 */

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'miki-suivi-materiel' });
const auth = getAuth(app);
const db = getFirestore(app);

async function createUser(email, password, displayName, role, tenantId) {
    let uid;
    try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        await auth.updateUser(uid, { password });
        console.log(`  ↻ ${email} mis à jour`);
    } catch {
        const created = await auth.createUser({ email, password, displayName });
        uid = created.uid;
        console.log(`  ✓ ${email} créé`);
    }

    await db.collection('users').doc(uid).set({
        id: uid,
        email,
        firstName: displayName.split(' ')[0],
        lastName: displayName.split(' ').slice(1).join(' ') || '',
        role,
        tenantsAccess: { [tenantId]: role },
        accessibleTenantIds: [tenantId],
        isArchived: false,
        isDisabled: false,
        mustChangePassword: false,
    }, { merge: true });

    return uid;
}

function qr(id) {
    return `MIKI-QR-${id.toUpperCase()}`;
}

function isoDate(daysAgo) {
    const d = new Date('2026-08-05T10:00:00.000Z');
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
}

async function seedEquipments(tenantId) {
    const col = db.collection('tenants').doc(tenantId).collection('equipments');

    const items = [
        // Autolaveuses
        {
            id: 'AL01',
            category: 'Autolaveuse', categoryCode: 'AL',
            name: 'AL01_202605_DepotA', type: 'Autolaveuse', subType: '',
            brand: 'Tennant', model: 'T5e', serialNumber: 'TN-20541',
            uniqueId: 'REF-AL-001', storageLocation: 'Dépôt A',
            status: 'AVAILABLE', isBatch: false, usageCount: 48, isArchived: false,
            qrCode: qr('AL01'), createdAt: isoDate(90),
            lastVisiteTechniqueDate: isoDate(30),
        },
        {
            id: 'AL02',
            category: 'Autolaveuse', categoryCode: 'AL',
            name: 'AL02_202605_DepotB', type: 'Autolaveuse', subType: '',
            brand: 'Kärcher', model: 'BR 45/22', serialNumber: 'KA-88312',
            uniqueId: 'REF-AL-002', storageLocation: 'Dépôt B',
            status: 'IN_USE', isBatch: false, usageCount: 132, isArchived: false,
            qrCode: qr('AL02'), createdAt: isoDate(120),
            lastVisiteTechniqueDate: isoDate(60),
            lastReparationDate: isoDate(15),
        },
        {
            id: 'AL03',
            category: 'Autolaveuse', categoryCode: 'AL',
            name: 'AL03_202606_DepotA', type: 'Autolaveuse', subType: '',
            brand: 'Nilfisk', model: 'SC400', serialNumber: 'NF-30011',
            uniqueId: 'REF-AL-003', storageLocation: 'Dépôt A',
            status: 'MAINTENANCE', isBatch: false, usageCount: 5, isArchived: false,
            qrCode: qr('AL03'), createdAt: isoDate(60),
        },

        // Mini Autolaveuses
        {
            id: 'MAL01',
            category: 'Mini Autolaveuse', categoryCode: 'MAL',
            name: 'MAL01_202604_DepotA', type: 'Mini Autolaveuse', subType: '',
            brand: 'Tennant', model: 'S5', serialNumber: 'TN-55102',
            uniqueId: 'REF-MAL-001', storageLocation: 'Dépôt A',
            status: 'AVAILABLE', isBatch: false, usageCount: 22, isArchived: false,
            qrCode: qr('MAL01'), createdAt: isoDate(150),
            lastVisiteTechniqueDate: isoDate(45),
        },
        {
            id: 'MAL02',
            category: 'Mini Autolaveuse', categoryCode: 'MAL',
            name: 'MAL02_202607_Clinique1', type: 'Mini Autolaveuse', subType: '',
            brand: 'Kärcher', model: 'BR 30/4', serialNumber: 'KA-99210',
            uniqueId: 'REF-MAL-002', storageLocation: 'Clinique 1',
            status: 'IN_USE', isBatch: false, usageCount: 9, isArchived: false,
            qrCode: qr('MAL02'), createdAt: isoDate(40),
        },

        // Nettoyeurs Vapeur
        {
            id: 'NV01',
            category: 'Nettoyeur Vapeur', categoryCode: 'NV',
            name: 'NV01_202603_DepotB', type: 'Nettoyeur Vapeur', subType: '',
            brand: 'Kärcher', model: 'SG 4/4', serialNumber: 'KA-44200',
            uniqueId: 'REF-NV-001', storageLocation: 'Dépôt B',
            status: 'AVAILABLE', isBatch: false, usageCount: 67, isArchived: false,
            qrCode: qr('NV01'), createdAt: isoDate(200),
            lastVisiteTechniqueDate: isoDate(20),
        },
        {
            id: 'NV02',
            category: 'Nettoyeur Vapeur', categoryCode: 'NV',
            name: 'NV02_202607_Clinique2', type: 'Nettoyeur Vapeur', subType: '',
            brand: 'Disan', model: 'Vap Pro', serialNumber: 'DS-10987',
            uniqueId: 'REF-NV-002', storageLocation: 'Clinique 2',
            status: 'AVAILABLE', isBatch: false, usageCount: 14, isArchived: false,
            qrCode: qr('NV02'), createdAt: isoDate(35),
        },

        // Chariots (batch)
        {
            id: 'CHA01',
            category: 'Chariot', categoryCode: 'Cha',
            name: 'Cha01_202602_DepotA', type: 'Chariot', subType: '',
            brand: 'Vileda', model: 'UltraSpeed', serialNumber: '',
            uniqueId: 'REF-CHA-001', storageLocation: 'Dépôt A',
            status: 'AVAILABLE', isBatch: true, batchQuantity: 12, batchTotal: 12,
            usageCount: 0, isArchived: false,
            qrCode: qr('CHA01'), createdAt: isoDate(180),
        },
        {
            id: 'CHA02',
            category: 'Chariot', categoryCode: 'Cha',
            name: 'Cha02_202607_DepotB', type: 'Chariot', subType: '',
            brand: 'Filmop', model: 'Base Pro', serialNumber: '',
            uniqueId: 'REF-CHA-002', storageLocation: 'Dépôt B',
            status: 'IN_USE', isBatch: true, batchQuantity: 3, batchTotal: 8,
            usageCount: 0, isArchived: false,
            qrCode: qr('CHA02'), createdAt: isoDate(42),
        },

        // Téléphones
        {
            id: 'TEL01',
            category: 'Téléphone', categoryCode: 'Tél',
            name: 'Tél01_202601_Bureau', type: 'Téléphone', subType: '',
            brand: 'Samsung', model: 'Galaxy A14', serialNumber: 'SM-A145F-01',
            uniqueId: 'REF-TEL-001', storageLocation: 'Bureau',
            status: 'IN_USE', isBatch: false, usageCount: 301, isArchived: false,
            qrCode: qr('TEL01'), createdAt: isoDate(210),
        },
        {
            id: 'TEL02',
            category: 'Téléphone', categoryCode: 'Tél',
            name: 'Tél02_202604_Bureau', type: 'Téléphone', subType: '',
            brand: 'Samsung', model: 'Galaxy A14', serialNumber: 'SM-A145F-02',
            uniqueId: 'REF-TEL-002', storageLocation: 'Bureau',
            status: 'AVAILABLE', isBatch: false, usageCount: 88, isArchived: false,
            qrCode: qr('TEL02'), createdAt: isoDate(120),
            lastReparationDate: isoDate(10),
        },

        // Voiture
        {
            id: 'V01',
            category: 'Voiture', categoryCode: 'V',
            name: 'V01_202601_Parking', type: 'Voiture', subType: '',
            brand: 'Renault', model: 'Kangoo', serialNumber: 'AA-123-NC',
            uniqueId: 'REF-V-001', storageLocation: 'Parking',
            status: 'AVAILABLE', isBatch: false, usageCount: 420, isArchived: false,
            qrCode: qr('V01'), createdAt: isoDate(365),
            lastVisiteTechniqueDate: isoDate(90),
        },

        // Centrale de Dilution
        {
            id: 'CDIL01',
            category: 'Centrale de Dilution', categoryCode: 'CDil',
            name: 'CDil01_202603_DepotA', type: 'Centrale de Dilution', subType: '',
            brand: 'Ecolab', model: 'Ecostar 3', serialNumber: 'EC-30001',
            uniqueId: 'REF-CDIL-001', storageLocation: 'Dépôt A',
            status: 'AVAILABLE', isBatch: false, usageCount: 0, isArchived: false,
            qrCode: qr('CDIL01'), createdAt: isoDate(170),
            lastVisiteTechniqueDate: isoDate(7),
        },
    ];

    for (const item of items) {
        const { id, ...data } = item;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ ${item.name} [${item.status}]`);
    }
}

async function seed() {
    console.log('\n🌱 Seeding émulateur MIKI...\n');

    // 1. Tenant platform (super admin)
    await db.collection('tenants').doc('platform').set({
        id: 'platform',
        name: 'Miki Platform',
        status: 'ACTIVE',
        timezone: 'Pacific/Noumea',
        quotas: { users: 100, equipments: 100 },
    }, { merge: true });

    // 2. Super Admin
    await createUser('admin@miki.nc', 'password123', 'Miki Admin', 'ADMIN', 'platform');

    // 3. Tenant de test
    const tenantRef = db.collection('tenants').doc('tenant-test');
    await tenantRef.set({
        id: 'tenant-test',
        name: 'Clinique Test',
        status: 'ACTIVE',
        timezone: 'Pacific/Noumea',
        quotas: { users: 20, equipments: 50 },
    }, { merge: true });

    // 4. Technicien (remplace Manager + Technicien — 4 rôles uniquement)
    await createUser('tech@miki.nc', 'password123', 'Tom Technicien', 'TECHNICIAN', 'tenant-test');

    // 5. Agent
    await createUser('agent@miki.nc', 'password123', 'Alex Agent', 'AGENT', 'tenant-test');

    // 6. Client
    await createUser('client@miki.nc', 'password123', 'Claire Client', 'CLIENT', 'tenant-test');

    // 7. Équipements de test
    console.log('\n📦 Ajout des équipements...\n');
    await seedEquipments('tenant-test');

    console.log('\n✅ Émulateur prêt !\n');
    console.log('  admin@miki.nc  / password123  →  Admin (plateforme)');
    console.log('  tech@miki.nc   / password123  →  Technicien (Clinique Test) — gestion + visites + tickets');
    console.log('  agent@miki.nc  / password123  →  Agent (Clinique Test)');
    console.log('  client@miki.nc / password123  →  Client (Clinique Test)');
    console.log('\n  UI émulateur : http://localhost:4000');
    console.log('  App          : http://localhost:3001\n');

    process.exit(0);
}

seed().catch(e => {
    console.error('Erreur :', e.message);
    process.exit(1);
});
