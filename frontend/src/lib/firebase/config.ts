// Firebase configuration for client-side SDK
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC8SaduwnXf05zyvldhXeDL-MmQf4W8DTs",
  authDomain: "plzenhancemyseo.firebaseapp.com",
  projectId: "plzenhancemyseo",
  storageBucket: "plzenhancemyseo.appspot.com",
  messagingSenderId: "132348098774",
  appId: "1:132348098774:web:7c4eccbd97708b72c77177"
};

// Initialize Firebase if it hasn't been initialized yet
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db }; 