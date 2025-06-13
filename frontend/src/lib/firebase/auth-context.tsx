import { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  getIdToken,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from './config';
import { getUserSubscriptionStatus, createOrUpdateUserProfile, debugUserSubscription } from './admin-users';
import { SubscriptionTier } from '@/config/navigation';

// Define the user type
interface User {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  subscription_status?: SubscriptionTier;
  getIdToken: () => Promise<string>;
}

// Define the auth context type
interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscription_status: SubscriptionTier;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  refreshSubscriptionStatus: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to retry operations with exponential backoff
const retryOperation = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Don't retry for permission errors
      if (error?.code === 'permission-denied') {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry operation failed');
};

// Convert Firebase user to our user type with timeout handling
const formatUser = async (user: FirebaseUser): Promise<User> => {
  try {
    // Create or update user profile with retry logic
    await retryOperation(async () => {
      await createOrUpdateUserProfile(user.uid, user.email, user.displayName, user.photoURL);
    }, 3, 1000);
    
    console.log('✅ User profile created/updated successfully');
  } catch (error: any) {
    console.warn('Profile creation/update failed:', error.message);
    // Continue with subscription check even if profile update fails
  }
  
  let subscriptionStatus: SubscriptionTier = 'free';
  
  try {
    // Get subscription status with timeout and retry
    subscriptionStatus = await retryOperation(async () => {
      const status = await getUserSubscriptionStatus(user.uid, user.email);
      return status as SubscriptionTier;
    }, 2, 1500);
    
    console.log('✅ Subscription status retrieved:', subscriptionStatus);
  } catch (error: any) {
    console.warn('Subscription status check failed, defaulting to free:', error.message);
    subscriptionStatus = 'free';
  }
  
  console.log('🎯 Final user object:', { 
    uid: user.uid, 
    email: user.email, 
    subscription_status: subscriptionStatus 
  });
  
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    subscription_status: subscriptionStatus,
    getIdToken: async () => {
      try {
        const token = await getIdToken(user);
        if (!token) throw new Error('Failed to get ID token');
        return token;
      } catch (error) {
        console.error('Error getting ID token:', error);
        throw error;
      }
    }
  };
};

// Create the auth provider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Watch for Firebase auth state changes with improved error handling
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const formattedUser = await formatUser(firebaseUser);
          setUser(formattedUser);
        } catch (error) {
          console.error('Critical error formatting user, using fallback:', error);
          
          // Robust fallback - always create a user object
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            subscription_status: 'free',
            getIdToken: async () => {
              const token = await getIdToken(firebaseUser);
              if (!token) throw new Error('Failed to get ID token');
              return token;
            }
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('Auth state change error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Login with email and password
  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Register with email and password
  const register = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Handle specific Firebase Auth errors gracefully
      if (error.code === 'auth/cancelled-popup-request') {
        console.info('Google sign-in popup was cancelled by user');
        return; // Don't throw error for user cancellation
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.info('Google sign-in popup was closed by user');
        return; // Don't throw error for user closing popup
      } else if (error.code === 'auth/popup-blocked') {
        console.error('Google sign-in popup was blocked by browser');
        throw new Error('Please allow popups for this site to sign in with Google');
      } else {
        console.error('Google sign-in error:', error);
        throw error;
      }
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Get ID token for authenticated requests
  const getUserIdToken = async () => {
    if (!auth.currentUser) return null;
    try {
      return await getIdToken(auth.currentUser);
    } catch (error) {
      console.error('Error getting ID token:', error);
      return null;
    }
  };

  // Refresh subscription status
  const refreshSubscriptionStatus = async () => {
    if (!user) return;
    
    try {
      // Get subscription status with timeout and retry
      const newSubscriptionStatus = await retryOperation(async () => {
        const status = await getUserSubscriptionStatus(user.uid, user.email);
        return status as SubscriptionTier;
      }, 2, 1500);
      
      console.log('✅ Subscription status refreshed:', newSubscriptionStatus);
      
      // Update user with new subscription status
      setUser(prevUser => {
        if (!prevUser) return null;
        return {
          ...prevUser,
          subscription_status: newSubscriptionStatus
        };
      });
    } catch (error: any) {
      console.warn('Subscription status refresh failed:', error.message);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading, 
        subscription_status: user?.subscription_status || 'free',
        login, 
        register, 
        logout,
        getIdToken: getUserIdToken,
        signInWithGoogle,
        refreshSubscriptionStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 