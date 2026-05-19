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

async function seedManager() {
    console.log("Creating manager account...");
    const email = 'manager@miki.nc';
    const password = 'managerMiki123!';
    let userRecord;
    try {
        userRecord = await auth.getUserByEmail(email);
        console.log("Manager account exists. Updating password...");
        await auth.updateUser(userRecord.uid, { password });
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            userRecord = await auth.createUser({
                email,
                password,
                displayName: 'Manager Test',
            });
            console.log("Manager user created.");
        } else {
            console.error(e);
            process.exit(1);
        }
    }

    // Assign to a default generated test tenant if platform doesn't make sense, 
    // or just a test tenant "TEST_TENANT_1"
    const tenantId = 'TEST_TENANT_1';

    const tenantRef = db.collection('tenants').doc(tenantId);
    await tenantRef.set({
        name: 'Chantier Test Alpha',
        quotas: { users: 50, equipments: 500 },
        logoUrl: '',
        timezone: 'Pacific/Noumea',
        status: 'ACTIVE'
    }, { merge: true });

    const userRef = db.collection('users').doc(userRecord.uid);
    await userRef.set({
        firstName: 'Manager',
        lastName: 'Test',
        email,
        role: 'MANAGER',
        tenantId,
        tenantsAccess: { [tenantId]: 'MANAGER' },
        accessibleTenantIds: [tenantId]
    }, { merge: true });

    console.log("Manager account successfully provisioned!");
    process.exit(0);
}

seedManager();
