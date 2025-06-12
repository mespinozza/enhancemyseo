'use client';

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { getUserUsage, getUsageDisplay, canPerformAction, getResetInfo, UserUsage } from '@/lib/usage-limits';
import { BarChart3, Crown, Zap, TrendingUp, Sparkles, X, ArrowUp, Clock } from 'lucide-react';
import Link from 'next/link';

interface UsageTrackerProps {
  tool: 'articles' | 'keywords';
  className?: string;
}

// Export the ref interface for external components to use
export interface UsageTrackerRef {
  refreshUsage: () => Promise<void>;
}

const tierDisplayNames = {
  free: 'Free',
  kickstart: 'Kickstart',
  seo_takeover: 'SEO Takeover',
  agency: 'Agency',
  admin: 'Admin',
};

const tierIcons = {
  free: BarChart3,
  kickstart: Zap,
  seo_takeover: TrendingUp,
  agency: Crown,
  admin: Sparkles,
};

const tierColors = {
  free: 'bg-gray-100 text-gray-800 border-gray-200',
  kickstart: 'bg-blue-100 text-blue-800 border-blue-200',
  seo_takeover: 'bg-purple-100 text-purple-800 border-purple-200',
  agency: 'bg-amber-100 text-amber-800 border-amber-200',
  admin: 'bg-green-100 text-green-800 border-green-200',
};

// Define upgrade paths for tier-specific suggestions
const UPGRADE_PATHS = {
  free: {
    nextTier: 'kickstart',
    nextTierName: 'Kickstart',
    benefits: ['15 articles per month', '10 keywords per month', 'No 24-hour wait'],
    buttonText: 'Upgrade to Kickstart',
    icon: Zap
  },
  kickstart: {
    nextTier: 'seo_takeover',
    nextTierName: 'SEO Takeover',
    benefits: ['40 articles per month', '30 keywords per month', '2.5x more content'],
    buttonText: 'Upgrade to SEO Takeover',
    icon: TrendingUp
  },
  seo_takeover: {
    nextTier: 'agency',
    nextTierName: 'Agency',
    benefits: ['Unlimited articles', 'Unlimited keywords', 'No monthly limits'],
    buttonText: 'Go Unlimited with Agency',
    icon: Crown
  },
  agency: {
    nextTier: null,
    nextTierName: null,
    benefits: ['Unlimited everything'],
    buttonText: null,
    icon: Crown
  },
  admin: {
    nextTier: null,
    nextTierName: null,
    benefits: ['Unlimited everything'],
    buttonText: null,
    icon: Sparkles
  }
};

const UsageTracker = forwardRef<UsageTrackerRef, UsageTrackerProps>(({ tool, className = '' }, ref) => {
  const { user, subscription_status } = useAuth();
  const { registerRefreshFunction, unregisterRefreshFunction } = useUsageRefresh();
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [resetInfo, setResetInfo] = useState<{
    resetText: string;
    canGenerateNow: boolean;
    nextResetDate?: Date;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const loadUsageAndResetInfo = async () => {
    if (!user) return;
    
    try {
      const [userUsage, resetData] = await Promise.all([
        getUserUsage(user.uid),
        getResetInfo(user.uid, subscription_status, tool)
      ]);
      
      setUsage(userUsage);
      setResetInfo(resetData);
    } catch (error) {
      console.error('Error loading usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshUsageData = async () => {
    console.log(`Refreshing usage data for ${tool}...`);
    setLoading(true);
    await loadUsageAndResetInfo();
    console.log(`Usage data refreshed for ${tool}`);
  };

  // Expose refresh function to parent components via ref
  useImperativeHandle(ref, () => ({
    refreshUsage: refreshUsageData
  }));

  // Register with the global refresh context
  useEffect(() => {
    registerRefreshFunction(tool, refreshUsageData);
    
    return () => {
      unregisterRefreshFunction(tool);
    };
  }, [tool, registerRefreshFunction, unregisterRefreshFunction]);

  useEffect(() => {
    loadUsageAndResetInfo();
  }, [user, subscription_status, tool]);

  if (loading || !user || !usage || !resetInfo) {
    return (
      <div className={`animate-pulse bg-gray-100 rounded-lg h-24 ${className}`} />
    );
  }

  const usageDisplay = getUsageDisplay(subscription_status, tool, usage);
  const TierIcon = tierIcons[subscription_status as keyof typeof tierIcons];
  const upgradeInfo = UPGRADE_PATHS[subscription_status as keyof typeof UPGRADE_PATHS];

  const isUnlimited = usageDisplay.limit === 'unlimited';
  const isFree = subscription_status === 'free';
  const isPaidTier = subscription_status === 'kickstart' || subscription_status === 'seo_takeover';
  const isNearLimit = !isUnlimited && !isFree && usageDisplay.percentage >= 80;
  const hasExceeded = !isUnlimited && usageDisplay.remaining === 0;
  const cannotGenerateNow = isFree && !resetInfo.canGenerateNow;
  const canUpgrade = upgradeInfo.nextTier !== null;

  const getProgressBarColor = () => {
    if (isUnlimited) return 'bg-green-500';
    if (hasExceeded || cannotGenerateNow) return 'bg-red-500';
    if (isNearLimit) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getBackgroundColor = () => {
    if (hasExceeded || cannotGenerateNow) return 'bg-red-50 border-red-200';
    if (isNearLimit) return 'bg-yellow-50 border-yellow-200';
    return 'bg-white border-gray-200';
  };

  const handleUpgradeClick = () => {
    // Scroll to pricing section on home page
    window.location.href = '/#pricing';
  };

  const handleLimitReachedClick = () => {
    if (canUpgrade) {
      setShowUpgradeModal(true);
    } else {
      handleUpgradeClick();
    }
  };

  const getLimitMessage = () => {
    if (hasExceeded) {
      if (isFree) {
        return {
          title: '⏰ 24-Hour Limit Reached',
          message: 'Free users can generate once every 24 hours.',
          action: null
        };
      } else if (canUpgrade) {
        return {
          title: '📈 Monthly Limit Reached',
          message: `You've used all ${usageDisplay.limit} ${tool} for this month on the ${tierDisplayNames[subscription_status as keyof typeof tierDisplayNames]} plan.`,
          action: `Upgrade to ${upgradeInfo.nextTierName} for ${upgradeInfo.benefits[0].toLowerCase()}`
        };
      } else {
        return {
          title: '🎉 Monthly Limit Reached',
          message: 'You\'re on the highest tier! Your limits will reset next month.',
          action: null
        };
      }
    } else if (cannotGenerateNow) {
      return {
        title: '⏳ Please Wait',
        message: 'Free users can generate once every 24 hours.',
        action: null
      };
    } else if (isNearLimit) {
      return {
        title: '⚠️ Running Low',
        message: `You have ${usageDisplay.remaining} ${tool} generations left this month.`,
        action: canUpgrade ? `Consider upgrading to ${upgradeInfo.nextTierName}` : 'Your limits will reset next month'
      };
    }
    return null;
  };

  const limitMessage = getLimitMessage();

  return (
    <>
      <div className={`p-4 rounded-lg border ${getBackgroundColor()} ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <TierIcon className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              {tool === 'articles' ? 'Article Generation' : 'Keyword Generation'}
            </span>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium border ${tierColors[subscription_status as keyof typeof tierColors]}`}>
            {tierDisplayNames[subscription_status as keyof typeof tierDisplayNames]}
          </div>
        </div>

        {/* Usage Display */}
        {isUnlimited ? (
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-full bg-green-100 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full w-full"></div>
            </div>
            <span className="text-xs font-medium text-green-600 whitespace-nowrap">
              Unlimited
            </span>
          </div>
        ) : (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">
                {usageDisplay.used} of {usageDisplay.limit} used
              </span>
              <span className="text-xs text-gray-600">
                {usageDisplay.remaining} remaining
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
                style={{ width: `${Math.min(100, usageDisplay.percentage)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {limitMessage ? (
          <div className={`rounded-md p-3 mt-3 ${
            hasExceeded || cannotGenerateNow ? 'bg-red-50 border border-red-200' :
            isNearLimit ? 'bg-yellow-50 border border-yellow-200' : 'bg-blue-50 border border-blue-200'
          }`}>
            <p className={`text-xs font-medium ${
              hasExceeded || cannotGenerateNow ? 'text-red-700' :
              isNearLimit ? 'text-yellow-700' : 'text-blue-700'
            }`}>
              {limitMessage.title}
            </p>
            <p className={`text-xs mt-1 ${
              hasExceeded || cannotGenerateNow ? 'text-red-600' :
              isNearLimit ? 'text-yellow-600' : 'text-blue-600'
            }`}>
              {limitMessage.message}
            </p>
            {limitMessage.action && (
              <p className={`text-xs mt-1 font-medium ${
                hasExceeded || cannotGenerateNow ? 'text-red-700' :
                isNearLimit ? 'text-yellow-700' : 'text-blue-700'
              }`}>
                {limitMessage.action}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-2">
            {resetInfo.resetText}
          </p>
        )}

        {/* Upgrade CTA for free users or when approaching limits */}
        {(isFree || (isNearLimit && canUpgrade)) && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={handleUpgradeClick}
              className={`inline-flex items-center justify-center w-full px-3 py-2 text-xs font-medium text-white rounded-md transition-colors ${
                isFree ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {isFree ? (
                <>
                  <Crown className="w-3 h-3 mr-1" />
                  Upgrade for More
                </>
              ) : (
                <>
                  <ArrowUp className="w-3 h-3 mr-1" />
                  Upgrade to {upgradeInfo.nextTierName}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Enhanced Upgrade Modal */}
      {showUpgradeModal && upgradeInfo.nextTier && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                <upgradeInfo.icon className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Upgrade to {upgradeInfo.nextTierName}
                </h3>
              </div>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                You've reached your {tool} limit for the {tierDisplayNames[subscription_status as keyof typeof tierDisplayNames]} plan. 
                Upgrade to {upgradeInfo.nextTierName} and get:
              </p>
              
              <ul className="space-y-2 mb-4">
                {upgradeInfo.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center space-x-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-700 font-medium">
                  🚀 Start creating more content immediately after upgrade!
                </p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  handleUpgradeClick();
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                {upgradeInfo.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

UsageTracker.displayName = 'UsageTracker';

export default UsageTracker; 