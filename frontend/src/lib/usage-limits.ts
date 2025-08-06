import { SubscriptionTier } from '@/config/navigation';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from './firebase/config';
import { getUserSubscriptionDate } from './firebase/admin-users';

export interface UsageData {
  articles: number | 'unlimited';
  keywords: number | 'unlimited';
  thumbnails: number | 'unlimited';
  lastReset: Date;
}

// Usage limits per subscription tier  
export const USAGE_LIMITS: Record<string, UsageData> = {
  free: {
    articles: 2,
    keywords: 1,
    thumbnails: 2,
    lastReset: new Date(2023, 0, 1), // Example last reset date
  },
  kickstart: {
    articles: 15,
    keywords: 10,
    thumbnails: 20,
    lastReset: new Date(2023, 0, 1), // Example last reset date
  },
  seo_takeover: {
    articles: 40,
    keywords: 30,
    thumbnails: 50,
    lastReset: new Date(2023, 0, 1), // Example last reset date
  },
  agency: {
    articles: 'unlimited',
    keywords: 'unlimited',
    thumbnails: 'unlimited',
    lastReset: new Date(2023, 0, 1), // Example last reset date
  },
  admin: {
    articles: 'unlimited',
    keywords: 'unlimited',
    thumbnails: 'unlimited',
    lastReset: new Date(2023, 0, 1), // Example last reset date
  },
};

// Get current month in YYYY-MM format
export const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Get user's current usage for the month
export const getUserUsage = async (uid: string): Promise<UsageData> => {
  const currentMonth = getCurrentMonth();
  const usageDocRef = doc(db, 'usage', `${uid}_${currentMonth}`);
  
  try {
    const usageDoc = await getDoc(usageDocRef);
    
    if (usageDoc.exists()) {
      return usageDoc.data() as UsageData;
    } else {
      // Create new usage document for the month
      const newUsage: UsageData = {
        articles: 0,
        keywords: 0,
        thumbnails: 0,
        lastReset: serverTimestamp() as unknown as Date,
      };
      
      await setDoc(usageDocRef, newUsage);
      return newUsage;
    }
  } catch (error) {
    console.error('Error getting user usage:', error);
    // Return default usage if error
    return {
      articles: 0,
      keywords: 0,
      thumbnails: 0,
      lastReset: new Date(),
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
      const updateData = {
        [tool]: increment(1),
        lastReset: serverTimestamp(),
      };
      
      await updateDoc(usageDocRef, updateData);
    } else {
      // Create new document with initial usage
      const newUsage: UsageData = {
        articles: tool === 'articles' ? 1 : 0,
        keywords: tool === 'keywords' ? 1 : 0,
        thumbnails: tool === 'thumbnails' ? 1 : 0,
        lastReset: serverTimestamp() as unknown as Date,
      };
      
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



// Get reset information for display
export const getResetInfo = async (
  uid: string,
  subscriptionTier: SubscriptionTier
): Promise<{
  resetText: string;
  canGenerateNow: boolean;
  nextResetDate?: Date;
}> => {
  // All users (including free) now use monthly limits
  if (subscriptionTier === 'free') {
    // Free users reset on the 1st of each month
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1); // 1st of next month
    
    return {
      resetText: 'Resets monthly on the 1st',
      canGenerateNow: true,
      nextResetDate: nextReset,
    };
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
  currentUsage: UsageData,
  requestedCount: number = 1 // NEW: Support for bulk requests
): Promise<{ canPerform: boolean; remaining: number | 'unlimited'; reason?: string; upgradeMessage?: string }> => {
  const limits = USAGE_LIMITS[subscriptionTier];
  const toolLimit = limits[tool];
  
  if (toolLimit === 'unlimited') {
    return { canPerform: true, remaining: 'unlimited' };
  }
  
  const usageValue = currentUsage[tool];
  const used = typeof usageValue === 'number' ? usageValue : 0;
  
  // Free users cannot do bulk generation (more than 1)
  if (subscriptionTier === 'free' && requestedCount > 1) {
    return {
      canPerform: false,
      remaining: 0,
      reason: `🚀 Bulk generation requires a paid plan. Upgrade to generate ${requestedCount} articles at once!`,
      upgradeMessage: 'Upgrade to Kickstart for 15 articles per month and bulk generation!'
    };
  }
  
  // For all users, check monthly limits
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
  currentUsage: UsageData
): {
  used: number;
  limit: number | 'unlimited';
  remaining: number | 'unlimited';
  percentage: number;
} => {
  const limits = USAGE_LIMITS[subscriptionTier];
  const toolLimit = limits[tool];
  const usageValue = currentUsage[tool];
  const used = typeof usageValue === 'number' ? usageValue : 0;
  
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