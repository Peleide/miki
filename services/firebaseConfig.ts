import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyD-wLZGnHMKkD4vexmPPnlSYMngVz4Pcfg",
  authDomain: "miki-suivi-materiel.firebaseapp.com",
  projectId: "miki-suivi-materiel",
  storageBucket: "miki-suivi-materiel.firebasestorage.app",
  messagingSenderId: "556286302448",
  appId: "1:556286302448:web:d176151d3e1df7f3964a35"
};

const app = initializeApp(firebaseConfig);

export const dbFirestore = getFirestore(app);
export const auth = getAuth(app);

// IMPORTANT: Doit correspondre à la région déployée (australia-southeast1)
export const functions = getFunctions(app, 'australia-southeast1');

// Connexion aux émulateurs en développement local
if (import.meta.env.DEV) {
  connectFirestoreEmulator(dbFirestore, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, 'localhost', 5001);
  console.info('[MIKI] Mode émulateur activé (Firestore:8080 | Auth:9099 | Functions:5001)');
}
