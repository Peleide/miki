import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION
const args = process.argv.slice(2);
let CSV_FILE_PATH = path.join(__dirname, '../legacy-scan.csv');
let TENANT_ID = 'PBN Matériel';
let TENANT_NAME = 'PBN Matériel';

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--csv') CSV_FILE_PATH = args[i + 1];
  if (args[i] === '--tenant') {
    TENANT_ID = args[i + 1];
    TENANT_NAME = args[i + 1];
  }
}

const TIMEZONE = 'Pacific/Noumea';
const TIMEZONE_OFFSET = '+11:00'; // Noumea offset

// Check for service account
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ ERREUR: Fichier de compte de service introuvable.');
  console.error('Veuillez définir la variable d\'environnement GOOGLE_APPLICATION_CREDENTIALS ou placer le fichier service-account.json à la racine.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function importLegacyScans() {
  console.log('🚀 Démarrage de l\'importation...');

  // 1. Créer/Mettre à jour le Tenant
  const tenantRef = db.collection('tenants').doc(TENANT_ID);
  await tenantRef.set({
    id: TENANT_ID,
    name: TENANT_NAME,
    status: 'ACTIVE',
    timezone: TIMEZONE,
    quotas: { rooms: 999, users: 999 },
    createdAt: new Date().toISOString()
  }, { merge: true });
  console.log(`✅ Tenant "${TENANT_NAME}" configuré.`);

  // 2. Lire le CSV
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ ERREUR: Fichier CSV introuvable à ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const headers = lines[0].split(',').map(h => h.trim()); // id,establishment,department,room,user,date,debut,fin,duration,manual_entry

  console.log(`📊 ${lines.length - 1} lignes trouvées dans le CSV.`);

  const batchSize = 400;
  let batch = db.batch();
  let operationCount = 0;
  let processedCount = 0;

  // Cache pour éviter les lectures inutiles
  const knownEstablishments = new Set();
  const knownDepartments = new Set();
  const knownRooms = new Set();
  const knownUsers = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(',').map(v => v.trim());
    
    if (values.length < 10) continue;

    const [id, establishmentName, departmentName, roomName, userName, dateStr, startTime, endTime, duration, manualEntry] = values;

    // Ignorer les lignes vides ou mal formées
    if (!establishmentName || !roomName || !userName || !dateStr || !startTime) continue;

    // --- STRUCTURE ---

    // Establishment (Site)
    const estId = `legacy_est_${slugify(establishmentName)}`;
    if (!knownEstablishments.has(estId)) {
      const estRef = tenantRef.collection('establishments').doc(estId);
      batch.set(estRef, {
        id: estId,
        tenantId: TENANT_ID,
        name: establishmentName,
        isArchived: false
      }, { merge: true });
      knownEstablishments.add(estId);
      operationCount++;
    }

    // Department (Zone) - Optionnel
    let deptId = 'legacy_dept_default';
    if (departmentName) {
      deptId = `legacy_dept_${slugify(departmentName)}`;
      if (!knownDepartments.has(deptId)) {
        const deptRef = tenantRef.collection('departments').doc(deptId);
        batch.set(deptRef, {
          id: deptId,
          tenantId: TENANT_ID,
          establishmentId: estId,
          name: departmentName,
          isArchived: false
        }, { merge: true });
        knownDepartments.add(deptId);
        operationCount++;
      }
    }

    // Room (Salle)
    const roomId = `legacy_room_${slugify(establishmentName)}_${slugify(roomName)}`;
    if (!knownRooms.has(roomId)) {
      const roomRef = tenantRef.collection('rooms').doc(roomId);
      batch.set(roomRef, {
        id: roomId,
        tenantId: TENANT_ID,
        departmentId: deptId,
        name: roomName,
        qrCode: roomId, // Placeholder
        instructions: "",
        isArchived: false
      }, { merge: true });
      knownRooms.add(roomId);
      operationCount++;
    }

    // User (Agent) - Legacy User
    const userId = `legacy_user_${slugify(userName)}`;
    if (!knownUsers.has(userId)) {
        const userRef = db.collection('users').doc(userId);
        // On crée un utilisateur minimal pour l'affichage
        batch.set(userRef, {
            id: userId,
            firstName: userName.split(' ')[0] || 'Inconnu',
            lastName: userName.split(' ').slice(1).join(' ') || '',
            email: `${slugify(userName)}@legacy.import`,
            role: 'AGENT',
            tenantId: TENANT_ID,
            tenantsAccess: { [TENANT_ID]: 'AGENT' },
            accessibleTenantIds: [TENANT_ID],
            isArchived: false,
            isDisabled: true // Désactivé car pas de vrai compte
        }, { merge: true });
        knownUsers.add(userId);
        operationCount++;
    }

    // --- CHECKINS ---

    // Date parsing (DD/MM/YYYY) -> ISO
    const [day, month, year] = dateStr.split('/');
    const isoDate = `${year}-${month}-${day}`;

    // Session ID unique pour lier Entry/Exit
    const sessionId = `legacy_session_${id}`;

    // ENTRY CheckIn
    const entryTimestamp = `${isoDate}T${startTime}:00${TIMEZONE_OFFSET}`;
    const entryId = `legacy_checkin_${id}_entry`;
    const entryRef = tenantRef.collection('checkins').doc(entryId);

    batch.set(entryRef, {
      id: entryId,
      tenantId: TENANT_ID,
      roomId: roomId,
      userId: userId,
      timestamp: entryTimestamp,
      type: 'ENTRY',
      isOffline: false,
      isManual: true, // Considéré comme manuel car importé
      source: manualEntry === '1' ? 'TABLET' : 'SCAN', // 0=QR, 1=Tablette
      sessionId: sessionId,
      agentNameSnapshot: userName,
      roomNameSnapshot: roomName,
      departmentId: deptId
    });
    operationCount++;

    // EXIT CheckIn (si fin existe)
    if (endTime && endTime !== '') {
      const exitTimestamp = `${isoDate}T${endTime}:00${TIMEZONE_OFFSET}`;
      const exitId = `legacy_checkin_${id}_exit`;
      const exitRef = tenantRef.collection('checkins').doc(exitId);

      batch.set(exitRef, {
        id: exitId,
        tenantId: TENANT_ID,
        roomId: roomId,
        userId: userId,
        timestamp: exitTimestamp,
        type: 'EXIT',
        isOffline: false,
        isManual: true,
        source: manualEntry === '1' ? 'TABLET' : 'SCAN',
        sessionId: sessionId,
        agentNameSnapshot: userName,
        roomNameSnapshot: roomName,
        departmentId: deptId
      });
      operationCount++;
    }

    processedCount++;

    // Commit batch si nécessaire
    if (operationCount >= batchSize) {
      await batch.commit();
      console.log(`💾 Batch commité (${operationCount} opérations)...`);
      batch = db.batch();
      operationCount = 0;
    }
  }

  // Commit final
  if (operationCount > 0) {
    await batch.commit();
    console.log(`💾 Dernier batch commité (${operationCount} opérations).`);
  }

  console.log(`✅ Import terminé ! ${processedCount} sessions traitées.`);
}

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

importLegacyScans().catch(console.error);
