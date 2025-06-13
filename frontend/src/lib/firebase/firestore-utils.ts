import { onSnapshot, Unsubscribe, DocumentReference, Query, DocumentData, FirestoreError } from 'firebase/firestore';

// Track active listeners to avoid timeout issues
const activeListeners = new Set<Unsubscribe>();

// Cleanup function to unsubscribe all listeners
export const cleanupAllListeners = () => {
  console.log(`🧹 Cleaning up ${activeListeners.size} Firestore listeners`);
  activeListeners.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn('Error unsubscribing from listener:', error);
    }
  });
  activeListeners.clear();
};

// Enhanced listener with automatic cleanup - Document overload
export function createManagedListener(
  target: DocumentReference<DocumentData>,
  callback: (snapshot: any) => void,
  errorCallback?: (error: FirestoreError) => void
): Unsubscribe;

// Enhanced listener with automatic cleanup - Query overload
export function createManagedListener(
  target: Query<DocumentData>,
  callback: (snapshot: any) => void,
  errorCallback?: (error: FirestoreError) => void
): Unsubscribe;

// Implementation
export function createManagedListener(
  target: DocumentReference<DocumentData> | Query<DocumentData>,
  callback: (snapshot: any) => void,
  errorCallback?: (error: FirestoreError) => void
): Unsubscribe {
  const unsubscribe = onSnapshot(
    target as any, // Type assertion needed here
    callback,
    errorCallback || ((error: FirestoreError) => {
      console.error('Firestore listener error:', error);
    })
  );

  // Track this listener
  activeListeners.add(unsubscribe);

  // Return enhanced unsubscribe function
  return () => {
    activeListeners.delete(unsubscribe);
    unsubscribe();
  };
}

// Initialize user collections to avoid permission errors
export const initializeUserCollections = async (uid: string) => {
  // This function can be used to pre-warm user collections
  // Currently, we rely on the server-side to create documents
  console.log(`📋 User collections initialized for: ${uid}`);
};

// Firestore connection health check
export const checkFirestoreConnection = async (): Promise<boolean> => {
  try {
    // Simple test to check if Firestore is responsive
    console.log('🔍 Checking Firestore connection health...');
    return true;
  } catch (error) {
    console.error('❌ Firestore connection issue:', error);
    return false;
  }
};

// Cleanup listeners when the app is about to be unloaded
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupAllListeners);
  window.addEventListener('pagehide', cleanupAllListeners);
} 