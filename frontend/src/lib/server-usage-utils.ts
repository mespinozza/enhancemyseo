import { SubscriptionTier } from '@/config/navigation';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { USAGE_LIMITS as SUBSCRIPTION_LIMITS } from './usage-limits';

interface UsageCheckResult {
  canPerform: boolean;
  reason?: string;
  currentUsage?: {
    articles: number;
    keywords: number;
    thumbnails: number;
  };
  upgradeInfo?: {
    nextTier: string | null;
    message: string;
    urgency: string;
  };
}

// Tier upgrade suggestions mapping
const UPGRADE_SUGGESTIONS = {
  free: {
    nextTier: 'kickstart',
    message: 'Upgrade to Kickstart for 15 articles and 10 keywords per month',
    urgency: 'Get 7.5x more articles with a paid plan!'
  },
  kickstart: {
    nextTier: 'seo_takeover',
    message: 'Upgrade to SEO Takeover for 40 articles and 30 keywords per month',
    urgency: 'Need more content? SEO Takeover gives you 2.5x more generations!'
  },
  seo_takeover: {
    nextTier: 'agency',
    message: 'Upgrade to Agency for unlimited articles and keywords',
    urgency: 'Go unlimited with the Agency tier - no more limits!'
  },
  agency: {
    nextTier: null,
    message: 'You have unlimited usage',
    urgency: 'Enjoy unlimited content generation!'
  },
  admin: {
    nextTier: null,
    message: 'You have unlimited usage',
    urgency: 'Admin access with unlimited content generation!'
  }
};

// Server-side usage verification functions for API endpoints
export const serverSideUsageUtils = {
  // These functions should only be used in API routes with Firebase Admin SDK
  getCurrentMonth: (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  // Check if user can perform action (server-side version)
  canPerformAction: async (
    uid: string,
    subscriptionTier: SubscriptionTier,
    tool: 'articles' | 'keywords',
    adminFirestore: Firestore
  ): Promise<UsageCheckResult> => {
    try {
      const currentMonth = serverSideUsageUtils.getCurrentMonth();
      const usageDocRef = adminFirestore.collection('usage').doc(`${uid}_${currentMonth}`);
      const usageDoc = await usageDocRef.get();
      
      let currentUsage = {
        uid,
        currentMonth,
        articles: 0,
        keywords: 0,
        thumbnails: 0,
        lastUpdated: null,
        lastArticleGeneration: null,
        lastKeywordGeneration: null,
      };
      
      if (usageDoc.exists) {
        currentUsage = { ...currentUsage, ...usageDoc.data() };
      }
      
      const limits = SUBSCRIPTION_LIMITS[subscriptionTier];
      const toolLimit = limits[tool];
      const upgradeInfo = UPGRADE_SUGGESTIONS[subscriptionTier];
      
      if (toolLimit === 'unlimited') {
        return { canPerform: true, currentUsage, upgradeInfo };
      }
      
      const used = currentUsage[tool] || 0;
      
      // For all users (including free), check monthly limits
      const remaining = Math.max(0, toolLimit - used);
      
      if (remaining === 0) {
        const nextTier = upgradeInfo.nextTier;
        const isLastTier = !nextTier;
        
        return {
          canPerform: false,
          reason: isLastTier 
            ? `🎉 You've reached your ${tool} limit for this month. You're on the highest tier!`
            : `📈 Monthly ${tool} limit reached for ${subscriptionTier} plan. ${upgradeInfo.urgency}`,
          currentUsage,
          upgradeInfo
        };
      }
      
      return {
        canPerform: true,
        currentUsage,
        upgradeInfo
      };
      
    } catch (error) {
      console.error('Server-side usage check error:', error);
      return { canPerform: false, reason: 'Usage verification failed' };
    }
  },

  // Increment usage (server-side version)
  incrementUsage: async (
    uid: string,
    tool: 'articles' | 'keywords',
    adminFirestore: Firestore
  ): Promise<void> => {
    try {
      const currentMonth = serverSideUsageUtils.getCurrentMonth();
      const usageDocRef = adminFirestore.collection('usage').doc(`${uid}_${currentMonth}`);
      
      const updateData: Record<string, unknown> = {
        [tool]: FieldValue.increment(1),
        lastUpdated: FieldValue.serverTimestamp(),
      };
      
      // Add specific timestamp for 24-hour tracking
      if (tool === 'articles') {
        updateData.lastArticleGeneration = FieldValue.serverTimestamp();
      } else {
        updateData.lastKeywordGeneration = FieldValue.serverTimestamp();
      }
      
      // Use set with merge to create document if it doesn't exist
      await usageDocRef.set(updateData, { merge: true });
      
    } catch (error) {
      console.error('Server-side usage increment error:', error);
      throw error;
    }
  },

  // Get upgrade suggestion for a tier
  getUpgradeSuggestion: (subscriptionTier: SubscriptionTier) => {
    return UPGRADE_SUGGESTIONS[subscriptionTier];
  }
};