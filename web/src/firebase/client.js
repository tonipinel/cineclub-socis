import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';
import { getFunctions } from 'firebase/functions';

// Configuració pública del projecte (la mateixa que fes-te-socia-form.js
// i l'administració). Les illes són `client:only`, així que només s'importa al navegador.
const firebaseConfig = {
  apiKey: 'AIzaSyDCVaFfq9sCwlthP8z4qmO-SoRH0nYr_9E',
  authDomain: 'cineclub-socis.firebaseapp.com',
  projectId: 'cineclub-socis',
  storageBucket: 'cineclub-socis.firebasestorage.app',
  messagingSenderId: '875624975916',
  appId: '1:875624975916:web:a5ac3c47b9e0955c77cb89',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
