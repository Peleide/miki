import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

const db = getFirestore(app);

async function listChecklists() {
    const tenantId = 'bg13bHRHDR6nYYRlC1Gx';
    const snapshot = await db.collection('tenants').doc(tenantId).collection('checklist_templates').get();
    snapshot.forEach(doc => {
        console.log(doc.id, '=>', JSON.stringify(doc.data()));
    });
    process.exit(0);
}

listChecklists();
