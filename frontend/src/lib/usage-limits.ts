import { SubscriptionTier } from '@/config/navigation';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from './firebase/config';
import { getUserSubscriptionDate } from './firebase/admin-users';

export interface UsageLimits {
  articles: number | 'unlimited';
  keywords: number | 'unlimited';
  thumbnails: number | 'unlimited';
}

export interface UserUsage {
  uid: string;
  currentMonth: string; // Format: YYYY-MM
  articles: number;
  keywords: number;
  thumbnails: number;
  lastUpdated: any;
  lastArticleGeneration?: any; // For 24-hour tracking
  lastKeywordGeneration?: any; // For 24-hour tracking
  lastThumbnailGeneration?: any; // For 24-hour tracking
}

// Define usage limits for each subscription tier
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, UsageLimits> = {
  free: {
    articles: 1,
    keywords: 1,
    thumbnails: 2,
  },
  kickstart: {
    articles: 15,
    keywords: 10,
    thumbnails: 20,
  },
  seo_takeover: {
    articles: 40,
    keywords: 30,
    thumbnails: 50,
  },
  agency: {
    articles: 'unlimited',
    keywords: 'unlimited',
    thumbnails: 'unlimited',
  },
  admin: {
    articles: 'unlimited',
    keywords: 'unlimited',
    thumbnails: 'unlimited',
  },
};

// Get current month in YYYY-MM format
export const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Get user's current usage for the month
export const getUserUsage = async (uid: string): Promise<UserUsage> => {
  const currentMonth = getCurrentMonth();
  const usageDocRef = doc(db, 'usage', `${uid}_${currentMonth}`);
  
  try {
    const usageDoc = await getDoc(usageDocRef);
    
    if (usageDoc.exists()) {
      return usageDoc.data() as UserUsage;
    } else {
      // Create new usage document for the month
      const newUsage: UserUsage = {
        uid,
        currentMonth,
        articles: 0,
        keywords: 0,
        thumbnails: 0,
        lastUpdated: serverTimestamp(),
      };
      
      await setDoc(usageDocRef, newUsage);
      return newUsage;
    }
  } catch (error) {
    console.error('Error getting user usage:', error);
    // Return default usage if error
    return {
      uid,
      currentMonth,
      articles: 0,
      keywords: 0,
      thumbnails: 0,
      lastUpdated: null,
    };
  }
};

// Secure increment usage using atomic operations (client-side safe version)
export const incrementUsage = async (uid: string, tool: 'articles' | 'keywords' | 'thumbnails'): Promise<void> => {
  const currentMonth = getCurrentMonth();
  const usageDocRef = doc(db, 'usage', `${uid}_${currentMonth}`);
  
  try {
    const usageDoc = await getDoc(usageDocRef);
    
    if (usageDoc.exists()) {
      // Use atomic increment to prevent race conditions
      const updateData: any = {
        [tool]: increment(1),
        lastUpdated: serverTimestamp(),
      };
      
      // Add specific timestamp for 24-hour tracking
      if (tool === 'articles') {
        updateData.lastArticleGeneration = serverTimestamp();
      } else if (tool === 'keywords') {
        updateData.lastKeywordGeneration = serverTimestamp();
      } else if (tool === 'thumbnails') {
        updateData.lastThumbnailGeneration = serverTimestamp();
      }
      
      await updateDoc(usageDocRef, updateData);
    } else {
      // Create new document with initial usage
      const newUsage: UserUsage = {
        uid,
        currentMonth,
        articles: tool === 'articles' ? 1 : 0,
        keywords: tool === 'keywords' ? 1 : 0,
        thumbnails: tool === 'thumbnails' ? 1 : 0,
        lastUpdated: serverTimestamp(),
      };
      
      // Add specific timestamp for 24-hour tracking
      if (tool === 'articles') {
        newUsage.lastArticleGeneration = serverTimestamp();
      } else if (tool === 'keywords') {
        newUsage.lastKeywordGeneration = serverTimestamp();
      } else if (tool === 'thumbnails') {
        newUsage.lastThumbnailGeneration = serverTimestamp();
      }
      
      await setDoc(usageDocRef, newUsage);
    }
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw error;
  }
};

// Calculate next reset date based on subscription date
export const getNextResetDate = (subscriptionDate: Date): Date => {
  const now = new Date();
  const subscriptionDay = subscriptionDate.getDate();
  
  // Start with current month
  let nextReset = new Date(now.getFullYear(), now.getMonth(), subscriptionDay);
  
  // If the reset day has already passed this month, move to next month
  if (nextReset <= now) {
    nextReset = new Date(now.getFullYear(), now.getMonth() + 1, subscriptionDay);
  }
  
  // Handle edge case where subscription day doesn't exist in target month (e.g., Jan 31 -> Feb 31)
  // In this case, use the last day of the month
  if (nextReset.getDate() !== subscriptionDay) {
    nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month + 1
  }
  
  return nextReset;
};

// Calculate next reset for free users (24 hours from last generation)
export const getNext24HourReset = async (uid: string, tool: 'articles' | 'keywords' | 'thumbnails'): Promise<Date | null> => {
  const currentMonth = getCurrentMonth();
  const usageDocRef = doc(db, 'usage', `${uid}_${currentMonth}`);
  
  try {
    const usageDoc = await getDoc(usageDocRef);
    
    if (usageDoc.exists()) {
      const data = usageDoc.data();
      const lastUpdated = data?.lastUpdated;
      
      if (lastUpdated && lastUpdated.toDate && data[tool] > 0) {
        const lastGeneration = lastUpdated.toDate();
        const nextReset = new Date(lastGeneration.getTime() + 24 * 60 * 60 * 1000); // 24 hours later
        return nextReset > new Date() ? nextReset : null; // Only return if in future
      }
    }
    
    return null; // No previous generation or can generate now
  } catch (error) {
    console.error('Error getting 24-hour reset:', error);
    return null;
  }
};

// Get reset information for display
export const getResetInfo = async (
  uid: string,
  subscriptionTier: SubscriptionTier,
  tool: 'articles' | 'keywords' | 'thumbnails'
): Promise<{
  resetText: string;
  canGenerateNow: boolean;
  nextResetDate?: Date;
}> => {
  if (subscriptionTier === 'free') {
    const nextReset = await getNext24HourReset(uid, tool);
    
    if (nextReset) {
      const timeUntilReset = nextReset.getTime() - new Date().getTime();
      const hoursLeft = Math.ceil(timeUntilReset / (1000 * 60 * 60));
      
      return {
        resetText: `Next generation available in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`,
        canGenerateNow: false,
        nextResetDate: nextReset,
      };
    } else {
      return {
        resetText: 'Generate your free content now',
        canGenerateNow: true,
      };
    }
  } else {
    // For paid subscriptions
    const subscriptionDate = await getUserSubscriptionDate(uid);
    
    if (subscriptionDate) {
      const nextReset = getNextResetDate(subscriptionDate);
      const resetDay = subscriptionDate.getDate();
      
      return {
        resetText: `Resets monthly on the ${resetDay}${getOrdinalSuffix(resetDay)}`,
        canGenerateNow: true,
        nextResetDate: nextReset,
      };
    } else {
      // Fallback for paid users without subscription date
      return {
        resetText: 'Resets monthly',
        canGenerateNow: true,
      };
    }
  }
};

// Helper function to get ordinal suffix (1st, 2nd, 3rd, etc.)
const getOrdinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) {
    return 'th';
  }
  
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

// Client-side check if user can perform action (complementary to server-side check)
export const canPerformAction = async (
  uid: string,
  subscriptionTier: SubscriptionTier,
  tool: 'articles' | 'keywords' | 'thumbnails',
  currentUsage: UserUsage,
  requestedCount: number = 1 // NEW: Support for bulk requests
): Promise<{ canPerform: boolean; remaining: number | 'unlimited'; reason?: string; upgradeMessage?: string }> => {
  const limits = SUBSCRIPTION_LIMITS[subscriptionTier];
  const toolLimit = limits[tool];
  
  if (toolLimit === 'unlimited') {
    return { canPerform: true, remaining: 'unlimited' };
  }
  
  const used = currentUsage[tool] || 0;
  
  // For free users, check 24-hour limit
  if (subscriptionTier === 'free') {
    // Free users cannot do bulk generation (more than 1)
    if (requestedCount > 1) {
      return {
        canPerform: false,
        remaining: 0,
        reason: `🚀 Bulk generation requires a paid plan. Upgrade to generate ${requestedCount} articles at once!`,
        upgradeMessage: 'Upgrade to Kickstart for 15 articles per month and bulk generation!'
      };
    }
    
    const lastGenField = tool === 'articles' ? 'lastArticleGeneration' : 
                          tool === 'keywords' ? 'lastKeywordGeneration' : 'lastThumbnailGeneration';
    const lastGeneration = currentUsage[lastGenField];
    
    if (lastGeneration) {
      // Convert Firestore timestamp to Date
      const lastGenTime = lastGeneration.toDate ? lastGeneration.toDate() : new Date(lastGeneration.seconds * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      if (lastGenTime > twentyFourHoursAgo) {
        const timeUntilReset = lastGenTime.getTime() + (24 * 60 * 60 * 1000) - Date.now();
        const hoursLeft = Math.ceil(timeUntilReset / (1000 * 60 * 60));
        
        return { 
          canPerform: false, 
          remaining: 0,
          reason: `⏰ Free users can generate once every 24 hours. Please wait ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`,
          upgradeMessage: 'Upgrade to Kickstart for unlimited daily access and 15 articles per month!'
        };
      }
    }
    
    return { canPerform: true, remaining: 1 };
  }
  
  // For paid users, check monthly limits
  const remaining = Math.max(0, toolLimit - used);
  
  // Check if they have enough remaining for the bulk request
  if (requestedCount > remaining) {
    const upgradeMessages = {
      kickstart: 'Upgrade to SEO Takeover for 40 articles and 30 keywords per month!',
      seo_takeover: 'Upgrade to Agency for unlimited articles and keywords!',
      agency: 'You\'re on the highest tier! Limits reset monthly.',
      admin: 'You have unlimited access.'
    };
    
    if (remaining === 0) {
      return {
        canPerform: false,
        remaining: 0,
        reason: `📈 Monthly ${tool} limit reached for ${subscriptionTier} plan.`,
        upgradeMessage: upgradeMessages[subscriptionTier as keyof typeof upgradeMessages]
      };
    } else {
      return {
        canPerform: false,
        remaining,
        reason: `📊 Requested ${requestedCount} ${tool} but only ${remaining} remaining in your ${subscriptionTier} plan.`,
        upgradeMessage: `You can generate ${remaining} more this month, or ` + upgradeMessages[subscriptionTier as keyof typeof upgradeMessages]
      };
    }
  }
  
  return {
    canPerform: true,
    remaining
  };
};

// Get usage display information
export const getUsageDisplay = (
  subscriptionTier: SubscriptionTier,
  tool: 'articles' | 'keywords' | 'thumbnails',
  currentUsage: UserUsage
): {
  used: number;
  limit: number | 'unlimited';
  remaining: number | 'unlimited';
  percentage: number;
} => {
  const limits = SUBSCRIPTION_LIMITS[subscriptionTier];
  const toolLimit = limits[tool];
  const used = currentUsage[tool] || 0;
  
  if (toolLimit === 'unlimited') {
    return {
      used,
      limit: 'unlimited',
      remaining: 'unlimited',
      percentage: 0,
    };
  }
  
  const remaining = Math.max(0, toolLimit - used);
  const percentage = toolLimit > 0 ? (used / toolLimit) * 100 : 0;
  
  return {
    used,
    limit: toolLimit,
    remaining,
    percentage,
  };
}; 