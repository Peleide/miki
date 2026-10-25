/**
 * Seed de l'émulateur Firebase local.
 * Ne nécessite pas de service-account.json.
 * Usage : node scripts/seedEmulator.mjs
 * (l'émulateur doit être lancé : firebase emulators:start)
 */

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'miki-suivi-materiel' });
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createUser(email, password, displayName, role, tenantId, extra = {}) {
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
        id: uid, email,
        firstName: displayName.split(' ')[0],
        lastName: displayName.split(' ').slice(1).join(' ') || '',
        role,
        tenantsAccess: { [tenantId]: role },
        accessibleTenantIds: [tenantId],
        isArchived: false,
        isDisabled: false,
        mustChangePassword: false,
        ...extra,
    }, { merge: true });

    return uid;
}

function qr(id) { return `MIKI-QR-${id.toUpperCase()}`; }

function isoDate(daysAgo, hour = 10) {
    const d = new Date('2026-09-01T00:00:00.000Z');
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour);
    return d.toISOString();
}

// ─── Equipements ─────────────────────────────────────────────────────────────

async function seedEquipments(tenantId) {
    const col = db.collection('tenants').doc(tenantId).collection('equipments');
    const items = [
        { id: 'AL01', category: 'Autolaveuse', categoryCode: 'AL', name: 'AL01_202605_DepotA', type: 'Autolaveuse', subType: '', brand: 'Tennant', model: 'T5e', serialNumber: 'TN-20541', uniqueId: 'REF-AL-001', storageLocation: 'Dépôt A', status: 'AVAILABLE', isBatch: false, usageCount: 48, isArchived: false, qrCode: qr('AL01'), createdAt: isoDate(90), lastVisiteTechniqueDate: isoDate(30) },
        { id: 'AL02', category: 'Autolaveuse', categoryCode: 'AL', name: 'AL02_202605_DepotB', type: 'Autolaveuse', subType: '', brand: 'Kärcher', model: 'BR 45/22', serialNumber: 'KA-88312', uniqueId: 'REF-AL-002', storageLocation: 'Dépôt B', status: 'IN_USE', isBatch: false, usageCount: 132, isArchived: false, qrCode: qr('AL02'), createdAt: isoDate(120), lastVisiteTechniqueDate: isoDate(60), lastReparationDate: isoDate(15), currentSiteId: 'site-hopital-nord' },
        { id: 'AL03', category: 'Autolaveuse', categoryCode: 'AL', name: 'AL03_202606_DepotA', type: 'Autolaveuse', subType: '', brand: 'Nilfisk', model: 'SC400', serialNumber: 'NF-30011', uniqueId: 'REF-AL-003', storageLocation: 'Dépôt A', status: 'MAINTENANCE', isBatch: false, usageCount: 5, isArchived: false, qrCode: qr('AL03'), createdAt: isoDate(60) },
        { id: 'MAL01', category: 'Mini Autolaveuse', categoryCode: 'MAL', name: 'MAL01_202604_DepotA', type: 'Mini Autolaveuse', subType: '', brand: 'Tennant', model: 'S5', serialNumber: 'TN-55102', uniqueId: 'REF-MAL-001', storageLocation: 'Dépôt A', status: 'AVAILABLE', isBatch: false, usageCount: 22, isArchived: false, qrCode: qr('MAL01'), createdAt: isoDate(150), lastVisiteTechniqueDate: isoDate(45) },
        { id: 'MAL02', category: 'Mini Autolaveuse', categoryCode: 'MAL', name: 'MAL02_202607_Clinique1', type: 'Mini Autolaveuse', subType: '', brand: 'Kärcher', model: 'BR 30/4', serialNumber: 'KA-99210', uniqueId: 'REF-MAL-002', storageLocation: 'Clinique 1', status: 'IN_USE', isBatch: false, usageCount: 9, isArchived: false, qrCode: qr('MAL02'), createdAt: isoDate(40), currentSiteId: 'site-clinique-sud' },
        { id: 'NV01', category: 'Nettoyeur Vapeur', categoryCode: 'NV', name: 'NV01_202603_DepotB', type: 'Nettoyeur Vapeur', subType: '', brand: 'Kärcher', model: 'SG 4/4', serialNumber: 'KA-44200', uniqueId: 'REF-NV-001', storageLocation: 'Dépôt B', status: 'AVAILABLE', isBatch: false, usageCount: 67, isArchived: false, qrCode: qr('NV01'), createdAt: isoDate(200), lastVisiteTechniqueDate: isoDate(20) },
        { id: 'CHA01', category: 'Chariot', categoryCode: 'Cha', name: 'Cha01_202602_DepotA', type: 'Chariot', subType: '', brand: 'Vileda', model: 'UltraSpeed', serialNumber: '', uniqueId: 'REF-CHA-001', storageLocation: 'Dépôt A', status: 'AVAILABLE', isBatch: true, batchQuantity: 12, batchTotal: 12, usageCount: 0, isArchived: false, qrCode: qr('CHA01'), createdAt: isoDate(180) },
        { id: 'TEL01', category: 'Téléphone', categoryCode: 'Tél', name: 'Tél01_202601_Bureau', type: 'Téléphone', subType: '', brand: 'Samsung', model: 'Galaxy A14', serialNumber: 'SM-A145F-01', uniqueId: 'REF-TEL-001', storageLocation: 'Bureau', status: 'IN_USE', isBatch: false, usageCount: 301, isArchived: false, qrCode: qr('TEL01'), createdAt: isoDate(210) },
        { id: 'V01', category: 'Voiture', categoryCode: 'V', name: 'V01_202601_Parking', type: 'Voiture', subType: '', brand: 'Renault', model: 'Kangoo', serialNumber: 'AA-123-NC', uniqueId: 'REF-V-001', storageLocation: 'Parking', status: 'AVAILABLE', isBatch: false, usageCount: 420, isArchived: false, qrCode: qr('V01'), createdAt: isoDate(365), lastVisiteTechniqueDate: isoDate(90) },
        // Équipement avec archivage demandé
        { id: 'NV02', category: 'Nettoyeur Vapeur', categoryCode: 'NV', name: 'NV02_202601_DepotB', type: 'Nettoyeur Vapeur', subType: '', brand: 'Disan', model: 'Vap Pro', serialNumber: 'DS-10987', uniqueId: 'REF-NV-002', storageLocation: 'Dépôt B', status: 'AVAILABLE', isBatch: false, usageCount: 14, isArchived: false, qrCode: qr('NV02'), createdAt: isoDate(35), archiveRequested: true, archiveRequestedAt: isoDate(2), archiveRequestedBy: 'uid-tech', archiveRequestedByName: 'Tom Technicien' },
    ];

    for (const item of items) {
        const { id, ...data } = item;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ ${item.name} [${item.status}]`);
    }
}

// ─── Sites ───────────────────────────────────────────────────────────────────

async function seedSites(tenantId) {
    const col = db.collection('tenants').doc(tenantId).collection('sites');
    const sites = [
        { id: 'site-hopital-nord', name: 'Hôpital Nord', address: '12 Avenue de la Santé, Nouméa', status: 'ACTIVE', createdAt: isoDate(180) },
        { id: 'site-clinique-sud', name: 'Clinique du Sud', address: '3 Rue des Palmiers, Dumbéa', status: 'ACTIVE', createdAt: isoDate(90) },
        { id: 'site-ehpad-colline', name: 'EHPAD La Colline', address: '8 Chemin des Flamboyants, Païta', status: 'ACTIVE', createdAt: isoDate(60) },
    ];
    for (const s of sites) {
        const { id, ...data } = s;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ ${s.name}`);
    }
}

// ─── Equipment Logs ──────────────────────────────────────────────────────────

async function seedLogs(tenantId, techId, agentId) {
    const col = db.collection('tenants').doc(tenantId).collection('equipmentLogs');
    const logs = [
        { id: 'log01', equipmentId: 'AL01', equipmentNameSnapshot: 'AL01_202605_DepotA', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'TAKE', timestamp: isoDate(5, 8), isOffline: false, isManual: false, siteId: 'site-hopital-nord' },
        { id: 'log02', equipmentId: 'AL01', equipmentNameSnapshot: 'AL01_202605_DepotA', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'RETURN', timestamp: isoDate(5, 17), isOffline: false, isManual: false },
        { id: 'log03', equipmentId: 'AL02', equipmentNameSnapshot: 'AL02_202605_DepotB', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'TAKE', timestamp: isoDate(3, 9), isOffline: false, isManual: false, siteId: 'site-hopital-nord' },
        { id: 'log04', equipmentId: 'MAL01', equipmentNameSnapshot: 'MAL01_202604_DepotA', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'TAKE', timestamp: isoDate(2, 7), isOffline: false, isManual: false, siteId: 'site-clinique-sud' },
        { id: 'log05', equipmentId: 'MAL01', equipmentNameSnapshot: 'MAL01_202604_DepotA', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'RETURN', timestamp: isoDate(2, 16), isOffline: false, isManual: false },
        // Saisie a posteriori
        { id: 'log06', equipmentId: 'TEL01', equipmentNameSnapshot: 'Tél01_202601_Bureau', userId: agentId, agentNameSnapshot: 'Alex Agent', action: 'TAKE', timestamp: isoDate(1, 9), isOffline: false, isManual: true, isAPosteriori: true, declaredAt: isoDate(1, 7), userNote: 'Prise oubliée à pointer le matin' },
        { id: 'log07', equipmentId: 'AL03', equipmentNameSnapshot: 'AL03_202606_DepotA', userId: techId, agentNameSnapshot: 'Tom Technicien', action: 'INTERVENTION', timestamp: isoDate(4, 14), isOffline: false, isManual: false, userNote: 'Révision courroie' },
    ];
    for (const l of logs) {
        const { id, ...data } = l;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ log ${l.action} → ${l.equipmentNameSnapshot}`);
    }
}

// ─── Incident Reports (Tickets) ───────────────────────────────────────────────

async function seedTickets(tenantId, agentId) {
    const col = db.collection('tenants').doc(tenantId).collection('incidentReports');
    const tickets = [
        { id: 'ticket01', equipmentId: 'AL03', equipmentNameSnapshot: 'AL03_202606_DepotA', userId: agentId, userNameSnapshot: 'Alex Agent', message: 'Brosse avant qui racle le sol anormalement, bruit suspect.', tags: ['Mécanique', 'Urgent'], status: 'IN_PROGRESS', priority: 'HIGH', type: 'BREAKDOWN', timestamp: isoDate(8), assignedToName: 'Tom Technicien' },
        { id: 'ticket02', equipmentId: 'TEL01', equipmentNameSnapshot: 'Tél01_202601_Bureau', userId: agentId, userNameSnapshot: 'Alex Agent', message: 'Batterie tient 2h max, besoin de remplacement.', tags: ['Usure'], status: 'OPEN', priority: 'MEDIUM', type: 'DAMAGE', timestamp: isoDate(3) },
        { id: 'ticket03', equipmentId: 'NV01', equipmentNameSnapshot: 'NV01_202603_DepotB', userId: agentId, userNameSnapshot: 'Alex Agent', message: 'Maintenance périodique à effectuer.', tags: ['Maintenance préventive'], status: 'RESOLVED', priority: 'LOW', type: 'PERIODIC_MAINTENANCE', timestamp: isoDate(30), resolutionNote: 'Détartrage complet effectué, joints remplacés.', resolutionTimestamp: isoDate(28) },
    ];
    for (const t of tickets) {
        const { id, ...data } = t;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ ticket [${t.status}] → ${t.equipmentNameSnapshot}`);
    }
}

// ─── Signalements ────────────────────────────────────────────────────────────

async function seedSignalements(tenantId, techId, agentId, clientId) {
    const col = db.collection('tenants').doc(tenantId).collection('signalements');
    const sigs = [
        {
            id: 'sig01',
            createdBy: clientId, createdByName: 'Claire Client', createdByRole: 'CLIENT',
            createdAt: isoDate(10), title: 'Autolaveuse AL02 en retard de restitution',
            description: "L'autolaveuse AL02 devait être restituée lundi mais n'est toujours pas disponible. Notre service en a besoin pour la journée.",
            equipmentId: 'AL02', equipmentName: 'AL02_202605_DepotB',
            siteId: 'site-hopital-nord', siteName: 'Hôpital Nord',
            status: 'IN_PROGRESS',
            replies: [
                { id: 'r01', authorId: techId, authorName: 'Tom Technicien', authorRole: 'TECHNICIAN', message: 'Bonjour, nous avons bien pris en compte votre signalement. L\'équipement sera restitué demain matin au plus tard.', createdAt: isoDate(9) },
                { id: 'r02', authorId: clientId, authorName: 'Claire Client', authorRole: 'CLIENT', message: 'Merci pour le retour, nous attendons sa disponibilité.', createdAt: isoDate(9, 14) },
            ],
            isArchived: false,
        },
        {
            id: 'sig02',
            createdBy: agentId, createdByName: 'Alex Agent', createdByRole: 'AGENT',
            createdAt: isoDate(3), title: 'Chariot CHA01 roue cassée',
            description: "Une roue du chariot CHA01 s'est détachée lors d'une utilisation. L'équipement est inutilisable en l'état.",
            equipmentId: 'CHA01', equipmentName: 'Cha01_202602_DepotA',
            status: 'NEW',
            replies: [],
            isArchived: false,
        },
        {
            id: 'sig03',
            createdBy: clientId, createdByName: 'Claire Client', createdByRole: 'CLIENT',
            createdAt: isoDate(45), title: 'Délai d\'intervention trop long — Clinique du Sud',
            description: "Le délai entre notre demande d'intervention et le passage de l'équipe dépasse régulièrement 48h.",
            siteId: 'site-clinique-sud', siteName: 'Clinique du Sud',
            status: 'CLOSED', closedAt: isoDate(30), closedBy: techId, closedByName: 'Tom Technicien',
            replies: [
                { id: 'r03', authorId: techId, authorName: 'Tom Technicien', authorRole: 'TECHNICIAN', message: 'Point pris en compte. Nous avons réorganisé le planning pour garantir une intervention sous 24h sur votre site.', createdAt: isoDate(42) },
                { id: 'r04', authorId: clientId, authorName: 'Claire Client', authorRole: 'CLIENT', message: 'Parfait, merci pour cette amélioration.', createdAt: isoDate(40) },
            ],
            isArchived: false,
        },
    ];
    for (const s of sigs) {
        const { id, ...data } = s;
        await col.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ signalement [${s.status}] "${s.title.slice(0, 40)}..."`);
    }
}

// ─── CDil Units + Session ─────────────────────────────────────────────────────

async function seedCdil(tenantId, techId) {
    const unitsCol = db.collection('tenants').doc(tenantId).collection('cdilUnits');
    const units = [
        { id: 'cdil-u01', serialNumber: '4839', location: 'Oncologie B26', service: 'Oncologie', roomCode: 'B26', isActive: true, createdAt: isoDate(180), lastVisitDate: isoDate(14), currentState: { buse: 'ok', crepine: 'ok', ligne: 'ok' } },
        { id: 'cdil-u02', serialNumber: '11503', location: 'Chirurgie C12', service: 'Chirurgie', roomCode: 'C12', isActive: true, createdAt: isoDate(180), lastVisitDate: isoDate(14), currentState: { buse: 1, crepine: 'ok', ligne: 'ok' } },
        { id: 'cdil-u03', serialNumber: '06A01243A', location: 'Urgences UA01', service: 'Urgences', roomCode: 'UA01', isActive: true, createdAt: isoDate(180), lastVisitDate: isoDate(14), currentState: { buse: 'ok', crepine: 2, ligne: 1 } },
        { id: 'cdil-u04', serialNumber: '7721', location: 'Pédiatrie D08', service: 'Pédiatrie', roomCode: 'D08', isActive: true, createdAt: isoDate(180), lastVisitDate: isoDate(14), currentState: { buse: 'ok', crepine: 'ok', ligne: 'ok' } },
        { id: 'cdil-u05', serialNumber: '3305', location: 'Maternité E03', service: 'Maternité', roomCode: 'E03', isActive: true, createdAt: isoDate(180), notes: 'Accès difficile, prévenir le chef de service' },
    ];
    for (const u of units) {
        const { id, ...data } = u;
        await unitsCol.doc(id).set({ ...data, id, tenantId }, { merge: true });
        console.log(`  ✓ CDil ${u.serialNumber} — ${u.location}`);
    }

    // Session complétée
    const sessionsCol = db.collection('tenants').doc(tenantId).collection('visitSessions');
    const completedSession = {
        id: 'session-completed-01',
        tenantId, type: 'CDIL', sessionType: 'PERIODIQUE',
        title: 'Visite technique Août 2026',
        date: isoDate(14).slice(0, 10),
        technicianId: techId, technicianName: 'Tom Technicien',
        status: 'COMPLETED', createdAt: isoDate(15), completedAt: isoDate(14),
        entries: [
            { unitId: 'cdil-u01', serialNumber: '4839', location: 'Oncologie B26', service: 'Oncologie', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
            { unitId: 'cdil-u02', serialNumber: '11503', location: 'Chirurgie C12', service: 'Chirurgie', buse: 1, crepine: 'ok', ligne: 'ok', remarks: 'Buse remplacée (1 remplacement)' },
            { unitId: 'cdil-u03', serialNumber: '06A01243A', location: 'Urgences UA01', service: 'Urgences', buse: 'ok', crepine: 2, ligne: 1, remarks: 'Crépine 2 remplacements, ligne 1 remplacement — à surveiller' },
            { unitId: 'cdil-u04', serialNumber: '7721', location: 'Pédiatrie D08', service: 'Pédiatrie', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
        ],
    };
    await sessionsCol.doc(completedSession.id).set(completedSession, { merge: true });
    console.log(`  ✓ Session CDil complétée "${completedSession.title}"`);

    // Session DRAFT en cours
    const draftSession = {
        id: 'session-draft-01',
        tenantId, type: 'CDIL', sessionType: 'PERIODIQUE',
        title: 'Visite technique Septembre 2026',
        date: isoDate(0).slice(0, 10),
        technicianId: techId, technicianName: 'Tom Technicien',
        status: 'DRAFT', createdAt: isoDate(1),
        entries: [
            { unitId: 'cdil-u01', serialNumber: '4839', location: 'Oncologie B26', service: 'Oncologie', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
            { unitId: 'cdil-u02', serialNumber: '11503', location: 'Chirurgie C12', service: 'Chirurgie', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
            { unitId: 'cdil-u03', serialNumber: '06A01243A', location: 'Urgences UA01', service: 'Urgences', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
            { unitId: 'cdil-u04', serialNumber: '7721', location: 'Pédiatrie D08', service: 'Pédiatrie', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
            { unitId: 'cdil-u05', serialNumber: '3305', location: 'Maternité E03', service: 'Maternité', buse: 'ok', crepine: 'ok', ligne: 'ok', remarks: '' },
        ],
    };
    await sessionsCol.doc(draftSession.id).set(draftSession, { merge: true });
    console.log(`  ✓ Session CDil DRAFT "${draftSession.title}"`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
    console.log('\n🌱 Seeding émulateur MIKI...\n');

    // 1. Tenant platform
    await db.collection('tenants').doc('platform').set({
        id: 'platform', name: 'Miki Platform', status: 'ACTIVE',
        timezone: 'Pacific/Noumea', quotas: { users: 100, equipments: 100 },
    }, { merge: true });

    // 2. Super Admin
    await createUser('admin@miki.nc', 'password123', 'Miki Admin', 'ADMIN', 'platform');

    // 3. Tenant de test
    await db.collection('tenants').doc('tenant-test').set({
        id: 'tenant-test', name: 'Clinique Test', status: 'ACTIVE',
        timezone: 'Pacific/Noumea', quotas: { users: 20, equipments: 50 },
    }, { merge: true });

    // 4. Utilisateurs (4 rôles)
    const techId = await createUser('tech@miki.nc', 'password123', 'Tom Technicien', 'TECHNICIAN', 'tenant-test', {
        assignedSiteIds: ['site-hopital-nord', 'site-clinique-sud'],
    });
    const agentId = await createUser('agent@miki.nc', 'password123', 'Alex Agent', 'AGENT', 'tenant-test');
    const clientId = await createUser('client@miki.nc', 'password123', 'Claire Client', 'CLIENT', 'tenant-test', {
        assignedSiteIds: ['site-hopital-nord'],
    });

    // Patch uid-tech for archiveRequestedBy reference in NV02
    await db.collection('users').where('email', '==', 'tech@miki.nc').get().then(async snap => {
        if (!snap.empty) {
            const realId = snap.docs[0].id;
            await db.collection('tenants').doc('tenant-test').collection('equipments').doc('NV02').update({ archiveRequestedBy: realId });
        }
    });

    console.log('\n📦 Équipements...\n');
    await seedEquipments('tenant-test');

    console.log('\n📍 Chantiers...\n');
    await seedSites('tenant-test');

    console.log('\n📋 Mouvements...\n');
    await seedLogs('tenant-test', techId, agentId);

    console.log('\n🔧 Tickets...\n');
    await seedTickets('tenant-test', agentId);

    console.log('\n🚩 Signalements...\n');
    await seedSignalements('tenant-test', techId, agentId, clientId);

    console.log('\n💧 CDil...\n');
    await seedCdil('tenant-test', techId);

    console.log('\n✅ Émulateur prêt !\n');
    console.log('  admin@miki.nc  / password123  →  Admin (plateforme)');
    console.log('  tech@miki.nc   / password123  →  Technicien (sites : Hôpital Nord + Clinique Sud)');
    console.log('  agent@miki.nc  / password123  →  Agent (Clinique Test)');
    console.log('  client@miki.nc / password123  →  Client (site : Hôpital Nord)');
    console.log('\n  UI émulateur : http://localhost:4000');
    console.log('  App          : http://localhost:5173\n');

    process.exit(0);
}

seed().catch(e => {
    console.error('Erreur :', e.message);
    process.exit(1);
});
