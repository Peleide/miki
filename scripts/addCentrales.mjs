import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

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

const db = getFirestore(app);
const TENANT_ID = 'bg13bHRHDR6nYYRlC1Gx';

const assets = [
    { name: "Oncologie B26 Disinfecto", id: "4839", buse: "ok", crepine: "1", ligne: "1" },
    { name: "Néphrologie A19 Lave-Bassin", id: "11503", buse: "ok", crepine: "1", ligne: "1" },
    { name: "R3N Vidoir / menage C-20", id: "INM 4824", buse: "1", crepine: "ok", ligne: "2" },
    { name: "R2S Plus au poste", id: "4838", buse: "1", crepine: "1", ligne: "2" },
    { name: "SSR Plus au poste", id: "11496", buse: "Pas de Buse", crepine: "2", ligne: "2" },
    { name: "R2N C19", id: "4816", buse: "ok", crepine: "2", ligne: "2" },
    { name: "Maternité B15 Renforcer Deterg'Arico", id: "4815", buse: "ok", crepine: "1", ligne: "2" },
    { name: "USC H45 Vidoir", id: "4813", buse: "ok", crepine: "d/a", ligne: "2" },
    { name: "Ambulatoire C52", id: "4811", buse: "ok", crepine: "ok", ligne: "2" },
    { name: "Ambulatoire (VIDOIR)", id: "4812", buse: "ok", crepine: "ok", ligne: "1" },
    { name: "Chimio A17", id: "4814", buse: "ok", crepine: "1", ligne: "2" },
    { name: "Bloc F02", id: "4825", buse: "ok", crepine: "ok", ligne: "2" },
    { name: "BOB E28 Prevoir remplacement Deterg'Arico", id: "4827", buse: "2", crepine: "2", ligne: "2" },
    { name: "Urgence G 08", id: "4833", buse: "ok", crepine: "1", ligne: "2" },
    { name: "Urgence G19", id: "11489", buse: "2", crepine: "1", ligne: "2" },
    { name: "SSR-1 A31", id: "11495", buse: "ok", crepine: "ok", ligne: "2" },
    { name: "Dialyse Centrale 1 (A 109)", id: "Serial n. 06A01243A", buse: "/", crepine: "/", ligne: "/" },
    { name: "Dialyse Centrale 2 (A 108)", id: "Serial n. 39A11477L", buse: "/", crepine: "/", ligne: "/" },
    { name: "Machiniste (Toilette Public)", id: "4835", buse: "1", crepine: "2", ligne: "2" },
    { name: "Stérilisation (côté propre) F 33", id: "4832", buse: "2", crepine: "2", ligne: "2" },
    { name: "Stérilisation (côté sale) E 24", id: "4834", buse: "1", crepine: "1", ligne: "2" },
    { name: "Sté (côté sale) lavage chariots F 15", id: "11507", buse: "2", crepine: "ok", ligne: "2" }
];

async function run() {
    const batch = db.batch();

    // 1. Create Checklist Template
    const checklistRef = db.collection('tenants').doc(TENANT_ID).collection('checklist_templates').doc();
    const buseItemId = randomUUID();
    const crepineItemId = randomUUID();
    const ligneItemId = randomUUID();

    const checklistData = {
        id: checklistRef.id,
        tenantId: TENANT_ID,
        name: 'Checklist Centrale',
        triggerType: 'MAINTENANCE',
        targetContext: 'TYPE',
        targetValue: 'Centrale',
        items: [
            { id: buseItemId, label: 'Etat Buse', type: 'TEXT', required: true },
            { id: crepineItemId, label: 'Etat Crépine', type: 'TEXT', required: true },
            { id: ligneItemId, label: "Etat Ligne d'aspiration", type: 'TEXT', required: true }
        ],
        isArchived: false
    };
    batch.set(checklistRef, checklistData);

    const maintenanceDate = new Date('2026-05-25T12:00:00Z');
    const nextMaintenanceDate = new Date('2026-11-25T12:00:00Z');

    // 2. Create Equipments and Maintenance Logs
    for (const asset of assets) {
        const eqRef = db.collection('tenants').doc(TENANT_ID).collection('equipments').doc();
        
        const eqData = {
            id: eqRef.id,
            tenantId: TENANT_ID,
            type: 'Centrale',
            subType: 'Centrale de dilution',
            brand: 'Inconnue',
            model: 'Inconnu',
            uniqueId: asset.id,
            name: asset.name,
            qrCode: `QR_${asset.id.replace(/\s+/g, '_')}`,
            status: 'AVAILABLE',
            isBatch: false,
            usageCount: 1, // for the first maintenance
            maintenanceIntervalDays: 180, // roughly 6 months
            lastMaintenanceDate: maintenanceDate.toISOString(),
            nextMaintenanceDate: nextMaintenanceDate.toISOString(),
            isArchived: false,
            createdAt: Timestamp.now()
        };
        batch.set(eqRef, eqData);

        // Maintenance Log
        const logRef = db.collection('tenants').doc(TENANT_ID).collection('maintenance_logs').doc();
        const logData = {
            id: logRef.id,
            tenantId: TENANT_ID,
            equipmentId: eqRef.id,
            userId: 'system', // or the ID of the person doing the import
            checklistId: checklistRef.id,
            equipmentNameSnapshot: asset.name,
            userNameSnapshot: 'Système (Import)',
            checklistNameSnapshot: 'Checklist Centrale',
            answers: {
                [buseItemId]: { value: asset.buse },
                [crepineItemId]: { value: asset.crepine },
                [ligneItemId]: { value: asset.ligne }
            },
            timestamp: maintenanceDate.toISOString(),
            serverTimestamp: Timestamp.now()
        };
        batch.set(logRef, logData);
    }

    await batch.commit();
    console.log(`Successfully added ${assets.length} centrales and their maintenance logs.`);
}

run().catch(console.error);
