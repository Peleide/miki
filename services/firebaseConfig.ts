import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

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
export const storage = getStorage(app);

// IMPORTANT: Doit correspondre à la région déployée (australia-southeast1)
export const functions = getFunctions(app, 'australia-southeast1');

// Connexion aux émulateurs en développement local
// L'hôte suit celui de la page : un téléphone du réseau local (http://192.168.x.x:3000) atteint aussi les émulateurs.
if (import.meta.env.DEV) {
  const host = window.location.hostname || 'localhost';
  connectFirestoreEmulator(dbFirestore, host, 8080);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
  console.info('[MIKI] Mode émulateur activé (Firestore:8080 | Auth:9099 | Functions:5001 | Storage:9199)');
}
