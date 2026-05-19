import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD-wLZGnHMKkD4vexmPPnlSYMngVz4Pcfg",
  authDomain: "miki-suivi-materiel.firebaseapp.com",
  projectId: "miki-suivi-materiel",
  storageBucket: "miki-suivi-materiel.firebasestorage.app",
  messagingSenderId: "556286302448",
  appId: "1:556286302448:web:d176151d3e1df7f3964a35"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const dbFirestore = getFirestore(app);
export const auth = getAuth(app);

// IMPORTANT: Doit correspondre à la région déployée (australia-southeast1)
export const functions = getFunctions(app, 'australia-southeast1');
