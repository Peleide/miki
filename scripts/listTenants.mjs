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

async function listTenants() {
    const snapshot = await db.collection('tenants').get();
    snapshot.forEach(doc => {
        console.log(doc.id, '=>', doc.data().name);
    });
    process.exit(0);
}

listTenants();
