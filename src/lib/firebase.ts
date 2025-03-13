import * as admin from 'firebase-admin';
import { config } from '../../config';

// Initialize Firebase Admin
const privateKey = config.firebase.privateKey?.replace(/\\n/g, '\n');

if (!privateKey) {
  throw new Error('Firebase private key is not set in environment variables');
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: privateKey,
  }),
});

// Get Firestore instance
export const db = admin.firestore();

// Get Auth instance
export const auth = admin.auth();

// Helper function to verify Firebase ID token
export const verifyToken = async (token: string) => {
  try {
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw error;
  }
}; 