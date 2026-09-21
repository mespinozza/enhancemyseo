import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore';
import { db } from './config';
import { SubscriptionTier } from '@/config/navigation';

// Interface for debug functions attached to window
interface WindowWithDebugFunctions extends Window {
  setMyTier?: (tier: SubscriptionTier) => Promise<void>;
  setMeAsAdmin?: () => Promise<void>;
  setMeAsFree?: () => Promise<void>;
  validateMySubscription?: () => Promise<void>;
  checkMyAccess?: () => Promise<void>;
}

// Define user subscription interface
export interface UserSubscription {
  uid: string;
  email: string;
  subscription_status: SubscriptionTier;
  displayName?: string;
  photoURL?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  addedBy?: string;
  subscriptionDate?: Timestamp | FieldValue; // When they started their current paid subscription
}

// Check if a user has admin subscription by checking the users collection
export const checkUserSubscriptionStatus = async (uid: string): Promise<SubscriptionTier | null> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const data = userDoc.data();
      const status = data?.subscription_status;
      
      // Validate that status is one of our expected values
      if (isValidSubscriptionTier(status)) {
        console.log('🔥 Firestore UID check result:', { uid, status });
        return status;
      } else {
        console.log('🔥 Invalid or missing subscription_status in document, treating as null');
        return null;
      }
    }
    console.log('🔥 No Firestore document found for UID:', uid);
    return null;
  } catch (error) {
    console.warn('Firestore permission issue for users collection (UID check):', error);
    return null;
  }
};

// Alternative: Check by email if preferred
export const checkEmailSubscriptionStatus = async (email: string): Promise<SubscriptionTier | null> => {
  try {
    if (!email) return null;
    
    const q = query(
      collection(db, 'users'),
      where('email', '==', email)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const data = userDoc.data();
      const status = data?.subscription_status;
      
      // Validate that status is one of our expected values
      if (isValidSubscriptionTier(status)) {
        console.log('📧 Firestore email check result:', { email, status });
        return status;
      } else {
        console.log('📧 Invalid or missing subscription_status in document, treating as null');
        return null;
      }
    }
    console.log('📧 No Firestore document found for email:', email);
    return null;
  } catch (error) {
    console.warn('Firestore permission issue for email check in users collection:', error);
    return null;
  }
};

// For initial setup - you can add admin users manually through Firebase Console
// or use this function in a one-time setup script
export const addUserSubscription = async (uid: string, email: string, subscription_status: SubscriptionTier, addedBy?: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      uid,
      email,
      subscription_status,
      addedAt: serverTimestamp(),
      addedBy: addedBy || 'system'
    });
    console.log(`✅ User subscription set: ${email} -> ${subscription_status}`);
  } catch (error) {
    console.error('Error adding user subscription:', error);
    throw error;
  }
};

// Main subscription check - Firestore-first approach
export const getUserSubscriptionStatus = async (uid: string, email: string | null): Promise<SubscriptionTier> => {
  console.log('🔍 Checking subscription status for:', { uid, email });
  
  try {
    // Primary check: Firestore by UID (most reliable)
    const firestoreStatus = await checkUserSubscriptionStatus(uid);
    if (firestoreStatus) {
      console.log('✅ Subscription status from Firestore (UID):', firestoreStatus);
      return firestoreStatus;
    }
    
    // Secondary check: Firestore by email (if UID lookup failed)
    if (email) {
      const emailStatus = await checkEmailSubscriptionStatus(email);
      if (emailStatus) {
        console.log('✅ Subscription status from Firestore (email):', emailStatus);
        // Update the user document with the UID for future lookups
        try {
          await updateUserSubscription(uid, emailStatus, false);
          console.log('📝 Updated user document with UID for future lookups');
        } catch (error) {
          console.warn('Failed to update user document with UID:', error);
        }
        return emailStatus;
      }
    }
    
    // If no status found in Firestore, create user as free
    console.log('❌ No subscription status found in Firestore, creating user as free');
    if (email) {
      try {
        await createOrUpdateUserProfile(uid, email);
        console.log('✅ Created user profile with free subscription');
        return 'free';
      } catch (error) {
        console.error('Failed to create user profile:', error);
      }
    }
    
    // Final fallback
    console.log('⚠️ Falling back to free subscription (no profile created)');
    return 'free';
    
  } catch (error) {
    console.warn('Firestore checks failed:', error);
    console.log('❌ Error checking subscription status, defaulting to free');
    return 'free';
  }
};

// Debug function to manually check subscription status
export const debugUserSubscription = async (uid: string, email: string | null): Promise<void> => {
  console.log('🐛 DEBUG: Starting subscription check for:', { uid, email });
  
  try {
    // Check Firestore document directly
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      console.log('🐛 DEBUG: Firestore document data:', data);
      console.log('🐛 DEBUG: subscription_status field:', data?.subscription_status);
    } else {
      console.log('🐛 DEBUG: No Firestore document found for UID');
      
      // Try to find by email
      if (email) {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          querySnapshot.forEach((doc) => {
            console.log('🐛 DEBUG: Found by email:', doc.data());
          });
        } else {
          console.log('🐛 DEBUG: No document found by email either');
        }
      }
    }
  } catch (error) {
    console.error('🐛 DEBUG: Error during debug check:', error);
  }
};

// Create or update user profile in Firestore
export const createOrUpdateUserProfile = async (
  uid: string, 
  email: string | null, 
  displayName?: string | null, 
  photoURL?: string | null
): Promise<void> => {
  try {
    if (!email) {
      console.warn('Cannot create user profile without email');
      return;
    }

    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    const userData: Partial<UserSubscription> = {
      uid,
      email,
      displayName: displayName || undefined,
      photoURL: photoURL || undefined,
      updatedAt: serverTimestamp(),
    };

    if (userDoc.exists()) {
      // Update existing user (preserve existing subscription_status and subscriptionDate)
      console.log('📝 Updating existing user profile:', email);
      await setDoc(userDocRef, userData, { merge: true });
    } else {
      // Create new user with default free subscription
      console.log('🆕 Creating new user profile with free subscription:', email);
      await setDoc(userDocRef, {
        ...userData,
        subscription_status: 'free',
        createdAt: serverTimestamp(),
        // Don't set subscriptionDate for free users
      });
    }
  } catch (error) {
    console.error('Error creating/updating user profile:', error);
    // Don't throw error to avoid breaking auth flow
  }
};

// Function to update user subscription status and set subscription date
export const updateUserSubscription = async (
  uid: string, 
  subscriptionStatus: SubscriptionTier,
  setSubscriptionDate: boolean = true
): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const updateData: {
      subscription_status: SubscriptionTier;
      updatedAt: FieldValue;
      subscriptionDate?: FieldValue | null;
    } = {
      subscription_status: subscriptionStatus,
      updatedAt: serverTimestamp(),
    };

    // Set subscription date for paid plans, remove it for free
    if (subscriptionStatus === 'free') {
      updateData.subscriptionDate = null;
    } else if (setSubscriptionDate) {
      updateData.subscriptionDate = serverTimestamp();
    }

    await setDoc(userDocRef, updateData, { merge: true });
    console.log(`✅ User subscription updated: ${uid} -> ${subscriptionStatus}`);
  } catch (error) {
    console.error('Error updating user subscription:', error);
    throw error;
  }
};

// Get user's subscription date
export const getUserSubscriptionDate = async (uid: string): Promise<Date | null> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      const subscriptionDate = data?.subscriptionDate;
      
      if (subscriptionDate && subscriptionDate.toDate) {
        return subscriptionDate.toDate();
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user subscription date:', error);
    return null;
  }
};

// Utility function to set admin status (can be called from browser console)
export const setUserAsAdmin = async (email: string): Promise<void> => {
  try {
    console.log('🔧 Setting user as admin:', email);
    
    // Find user by email
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      await setDoc(doc(db, 'users', userDoc.id), {
        ...userData,
        subscription_status: 'admin',
        updatedAt: serverTimestamp(),
        adminSetBy: 'manual_override'
      });
      
      console.log('✅ User set as admin successfully:', email);
    } else {
      console.error('❌ No user found with email:', email);
    }
  } catch (error) {
    console.error('Error setting user as admin:', error);
    throw error;
  }
};

// Utility function to set free status (can be called from browser console)
export const setUserAsFree = async (email: string): Promise<void> => {
  try {
    console.log('🔧 Setting user as free:', email);
    
    // Find user by email
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      await setDoc(doc(db, 'users', userDoc.id), {
        ...userData,
        subscription_status: 'free',
        updatedAt: serverTimestamp(),
        freeSetBy: 'manual_override'
      });
      
      console.log('✅ User set as free successfully:', email);
    } else {
      console.error('❌ No user found with email:', email);
    }
  } catch (error) {
    console.error('Error setting user as free:', error);
    throw error;
  }
};

// Quick function to set current user to any tier (for testing)
// Call this from browser console: window.setMyTier('kickstart')
if (typeof window !== 'undefined') {
  (window as WindowWithDebugFunctions).setMyTier = async (tier: SubscriptionTier) => {
    try {
      const { auth } = await import('./config');
      if (auth.currentUser?.email) {
        await setUserSubscription(auth.currentUser.email, tier);
        console.log(`🎉 You are now ${tier} tier! Refresh the page.`);
      } else {
        console.error('No authenticated user found');
      }
    } catch (error) {
      console.error('Error setting subscription tier:', error);
    }
  };
}

// Quick function to set current user as admin (for testing)
// Call this from browser console: window.setMeAsAdmin()
if (typeof window !== 'undefined') {
  (window as WindowWithDebugFunctions).setMeAsAdmin = async () => {
    try {
      const { auth } = await import('./config');
      if (auth.currentUser?.email) {
        await setUserAsAdmin(auth.currentUser.email);
        console.log('🎉 You are now admin! Refresh the page.');
      } else {
        console.error('No authenticated user found');
      }
    } catch (error) {
      console.error('Error setting admin status:', error);
    }
  };

  // Quick function to set current user as free (for testing)
  // Call this from browser console: window.setMeAsFree()
  (window as WindowWithDebugFunctions).setMeAsFree = async () => {
    try {
      const { auth } = await import('./config');
      if (auth.currentUser?.email) {
        await setUserAsFree(auth.currentUser.email);
        console.log('🎉 You are now free tier! Refresh the page.');
      } else {
        console.error('No authenticated user found');
      }
    } catch (error) {
      console.error('Error setting free status:', error);
    }
  };

  // Utility function to validate and fix current user's subscription status
  // Call this from browser console: window.validateMySubscription()
  (window as WindowWithDebugFunctions).validateMySubscription = async () => {
    try {
      const { auth } = await import('./config');
      if (auth.currentUser?.uid && auth.currentUser?.email) {
        await debugUserSubscription(auth.currentUser.uid, auth.currentUser.email);
        
        const status = await checkUserSubscriptionStatus(auth.currentUser.uid);
        if (!status) {
          console.log('⚠️ No valid subscription status found, setting to free...');
          await setUserAsFree(auth.currentUser.email);
          console.log('✅ Subscription status fixed to free. Refresh the page.');
        } else {
          console.log(`✅ Valid subscription status found: ${status}`);
        }
      } else {
        console.error('No authenticated user found');
      }
    } catch (error) {
      console.error('Error validating subscription:', error);
    }
  };

  // Simple function to check what features current user should see
  // Call this from browser console: window.checkMyAccess()
  (window as WindowWithDebugFunctions).checkMyAccess = async () => {
    try {
      const { auth } = await import('./config');
      if (auth.currentUser?.uid && auth.currentUser?.email) {
        const status = await getUserSubscriptionStatus(auth.currentUser.uid, auth.currentUser.email);
        console.log(`🎯 Current subscription status: ${status}`);
        
        // Import navigation to show what features they should see
        const { getFilteredNavigation } = await import('@/config/navigation');
        const features = getFilteredNavigation(status);
        
        console.log('🎛️ Available features:');
        features.forEach(feature => {
          console.log(`  • ${feature.name} (${feature.href})`);
        });
        
        const adminFeatures = ['Collections', 'Products'];
        const hasAdminFeatures = features.some(f => adminFeatures.includes(f.name));
        
        if (status === 'free' && hasAdminFeatures) {
          console.error('❌ BUG: Free user seeing admin features!');
        } else if (status === 'admin' && !hasAdminFeatures) {
          console.error('❌ BUG: Admin user NOT seeing admin features!');
        } else {
          console.log('✅ Feature access is correct for subscription tier');
        }
      } else {
        console.error('No authenticated user found');
      }
    } catch (error) {
      console.error('Error checking access:', error);
    }
  };
}

// Validate subscription tier
export const isValidSubscriptionTier = (tier: unknown): tier is SubscriptionTier => {
  return ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'].includes(tier as string);
};

// Utility function to set any subscription tier (can be called from browser console)
export const setUserSubscription = async (email: string, tier: SubscriptionTier): Promise<void> => {
  try {
    console.log(`🔧 Setting user subscription: ${email} -> ${tier}`);
    
    // Find user by email
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      const updateData: Record<string, unknown> & {
        subscription_status: SubscriptionTier;
        updatedAt: FieldValue;
        manualSetBy: string;
        subscriptionDate?: FieldValue | null;
      } = {
        ...userData,
        subscription_status: tier,
        updatedAt: serverTimestamp(),
        manualSetBy: 'admin_override'
      };

      // Set subscription date for paid plans, remove it for free
      if (tier === 'free') {
        updateData.subscriptionDate = null;
      } else {
        updateData.subscriptionDate = serverTimestamp();
      }
      
      await setDoc(doc(db, 'users', userDoc.id), updateData);
      
      console.log(`✅ User subscription updated successfully: ${email} -> ${tier}`);
    } else {
      console.error('❌ No user found with email:', email);
    }
  } catch (error) {
    console.error('Error setting user subscription:', error);
    throw error;
  }
}; 