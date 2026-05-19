import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

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

async function seedAdmin() {
    console.log("Creating admin account...");
    const email = 'admin@miki.nc';
    const password = 'password123';
    let userRecord;
    try {
        userRecord = await auth.getUserByEmail(email);
        console.log("Admin account exists. Updating password...");
        await auth.updateUser(userRecord.uid, { password });
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            const result = await auth.createUser({
                email,
                password,
                displayName: 'Administrateur',
            });
            userRecord = result;
            console.log("Admin user created.");
        } else {
            console.error(e);
            process.exit(1);
        }
    }

    const tenantId = 'platform';

    const platformRef = db.collection('tenants').doc(tenantId);
    await platformRef.set({
        name: 'Miki',
        quotas: { users: 10, equipments: 10 },
        logoUrl: '',
        timezone: 'Europe/Paris'
    }, { merge: true });

    const userRef = db.collection('users').doc(userRecord.uid);
    await userRef.set({
        firstName: 'Miki',
        lastName: 'Admin',
        email,
        role: 'ADMIN',
        tenantId,
        tenantsAccess: { [tenantId]: 'ADMIN' },
        accessibleTenantIds: [tenantId]
    }, { merge: true });

    console.log("Admin account successfully provisioned!");
    process.exit(0);
}

seedAdmin();
