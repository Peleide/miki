/**
 * Seed CDil pour tester l'export CSV.
 * Crée 6 unités CDil + 2 sessions clôturées (1 périodique, 1 intervention).
 * Usage : node scripts/seedCdil.mjs
 * (les émulateurs doivent tourner : firebase emulators:start --project miki-suivi-materiel)
 */

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'miki-suivi-materiel' });
const auth = getAuth(app);
const db = getFirestore(app);

const TENANT_ID = 'tenant-test';

// Récupère l'uid du technicien
let techUid = 'tech-uid-unknown';
try {
    const techUser = await auth.getUserByEmail('tech@miki.nc');
    techUid = techUser.uid;
} catch {}

const UNITS = [
    { serialNumber: '4839',  location: 'Oncologie B26',      service: 'Oncologie',          roomCode: 'B26'  },
    { serialNumber: '11503', location: 'Chirurgie C12',       service: 'Chirurgie',          roomCode: 'C12'  },
    { serialNumber: '7201',  location: 'Urgences U04',        service: 'Urgences',           roomCode: 'U04'  },
    { serialNumber: '9044',  location: 'Réanimation R01',     service: 'Réanimation',        roomCode: 'R01'  },
    { serialNumber: '3312',  location: 'Pédiatrie P08',       service: 'Pédiatrie',          roomCode: 'P08'  },
    { serialNumber: '6607',  location: 'Maternité M03',       service: 'Maternité',          roomCode: 'M03'  },
];

console.log('\n🚿 Seed CDil — Centrales de Dilution\n');

// ── 1. Créer les unités CDil ──────────────────────────────────────────────────
console.log('📌 Création des unités CDil...');
const unitRefs = [];
for (const u of UNITS) {
    const ref = db.collection('tenants').doc(TENANT_ID).collection('cdilUnits').doc();
    await ref.set({
        id: ref.id,
        tenantId: TENANT_ID,
        serialNumber: u.serialNumber,
        location: u.location,
        service: u.service,
        roomCode: u.roomCode,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastVisitDate: '2026-02-15',
        currentState: { buse: 'ok', crepine: 'ok', ligne: 'ok' },
    });
    unitRefs.push({ id: ref.id, ...u });
    console.log(`  ✓ ${u.serialNumber} — ${u.location}`);
}

// ── 2. Session périodique clôturée (toutes les unités) ───────────────────────
console.log('\n📋 Création session PÉRIODIQUE clôturée...');

const periodiqueEntries = unitRefs.map((u, i) => ({
    unitId: u.id,
    serialNumber: u.serialNumber,
    location: u.location,
    service: u.service,
    buse: i === 2 ? 1 : 'ok',          // Urgences U04 : buse remplacée 1 fois
    crepine: i === 3 ? 2 : 'ok',        // Réanimation R01 : crépine remplacée 2 fois
    ligne: 'ok',
    remarks: i === 2 ? 'Remplacement buse effectué. RAS.' : i === 3 ? 'Crépine très encrassée, 2e remplacement.' : '',
    photos: [],
}));

const periodiqueRef = db.collection('tenants').doc(TENANT_ID).collection('visitSessions').doc();
await periodiqueRef.set({
    id: periodiqueRef.id,
    tenantId: TENANT_ID,
    type: 'CDIL',
    sessionType: 'PERIODIQUE',
    title: 'Visite périodique — Février 2026',
    date: '2026-02-15',
    technicianId: techUid,
    technicianName: 'Tech MIKI',
    status: 'COMPLETED',
    createdAt: '2026-02-15T08:00:00.000Z',
    completedAt: '2026-02-15T11:30:00.000Z',
    entries: periodiqueEntries,
});
console.log(`  ✓ Session périodique (${periodiqueEntries.length} unités)`);

// ── 3. Session intervention clôturée (2 unités ciblées) ──────────────────────
console.log('\n🔧 Création session INTERVENTION clôturée...');

const interventionUnits = [unitRefs[0], unitRefs[4]]; // Oncologie + Pédiatrie
const interventionEntries = interventionUnits.map(u => ({
    unitId: u.id,
    serialNumber: u.serialNumber,
    location: u.location,
    service: u.service,
    buse: 1,
    crepine: 'ok',
    ligne: 1,
    remarks: 'Intervention suite à signalement. Buse et ligne rincées.',
    photos: [],
}));

const interventionRef = db.collection('tenants').doc(TENANT_ID).collection('visitSessions').doc();
await interventionRef.set({
    id: interventionRef.id,
    tenantId: TENANT_ID,
    type: 'CDIL',
    sessionType: 'INTERVENTION',
    title: 'Intervention — Oncologie & Pédiatrie',
    date: '2026-04-03',
    technicianId: techUid,
    technicianName: 'Tech MIKI',
    status: 'COMPLETED',
    createdAt: '2026-04-03T09:00:00.000Z',
    completedAt: '2026-04-03T10:15:00.000Z',
    entries: interventionEntries,
});
console.log(`  ✓ Session intervention (${interventionEntries.length} unités)`);

console.log(`
✅ Seed CDil terminé !

  Unités créées  : ${UNITS.length}
  Sessions       : 1 périodique (15 fév 2026) + 1 intervention (3 avr 2026)

  → Manager : ManagementPanel > CENTRALES > Historique des Visites > CSV
  → Tech    : VISITES > Historique > CSV
`);
