import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore';
import { db } from './config';
import { SubscriptionTier } from '@/config/navigation';

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

// Validate subscription tier
export const isValidSubscriptionTier = (tier: unknown): tier is SubscriptionTier => {
  return ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'].includes(tier as string);
};
