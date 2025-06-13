import { getFirestore } from 'firebase-admin/firestore';
import { SubscriptionTier } from '@/config/navigation';

// Server-side function to get subscription status using Firebase Admin SDK
export async function getServerUserSubscriptionStatus(uid: string, email: string | null): Promise<SubscriptionTier> {
  console.log('🔍 Server: Checking subscription status for:', { uid, email });
  
  const adminFirestore = getFirestore();
  
  try {
    // Primary check: Firestore by UID using Admin SDK
    const userDocRef = adminFirestore.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      const status = data?.subscription_status;
      
      console.log('🔥 Server: Firestore document data:', data);
      console.log('🔥 Server: subscription_status field:', status);
      
      if (status && isValidSubscriptionTier(status)) {
        console.log('✅ Server: Subscription status from Firestore (UID):', status);
        return status;
      } else {
        console.log('🔥 Server: Invalid or missing subscription_status, treating as free');
        return 'free';
      }
    }
    
    console.log('🔥 Server: No Firestore document found for UID:', uid);
    
    // Secondary check: Find by email using Admin SDK
    if (email) {
      const usersQuery = adminFirestore.collection('users').where('email', '==', email);
      const querySnapshot = await usersQuery.get();
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const data = userDoc.data();
        const status = data?.subscription_status;
        
        console.log('📧 Server: Found by email, subscription_status:', status);
        
        if (status && isValidSubscriptionTier(status)) {
          console.log('✅ Server: Subscription status from Firestore (email):', status);
          return status;
        }
      }
    }
    
    // Fallback to free
    console.log('⚠️ Server: Falling back to free subscription');
    return 'free';
    
  } catch (error) {
    console.error('❌ Server: Error checking subscription status:', error);
    return 'free';
  }
}

// Validate subscription tier
function isValidSubscriptionTier(tier: any): tier is SubscriptionTier {
  return ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'].includes(tier);
} 