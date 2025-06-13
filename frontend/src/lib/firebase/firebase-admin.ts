// Utility function for Firebase configuration
// This helper creates a simplified setup for Firebase that makes it easier to work with Next.js

const getFirebaseConfig = () => {
  // Check if we're in development mode
  if (process.env.NODE_ENV === 'development') {
    // In development, try to use environment variables first, fall back to hardcoded values if needed
    return {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',  // You'll need to set this in .env.local
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "plzenhancemyseo.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "plzenhancemyseo",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "plzenhancemyseo.appspot.com",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "548921523768",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:548921523768:web:3aed909d4711e9ea5b0a86"
    };
  }
  
  // In production, always use environment variables
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
};

export { getFirebaseConfig }; 