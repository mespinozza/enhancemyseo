'use client';

import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { getResetInfo, USAGE_LIMITS } from '@/lib/usage-limits';
import { allowanceNoun, useAllowance, type Allowance, type AllowanceKind } from '@/lib/allowance';
import BuyCredits from '@/components/credits/BuyCredits';
import { BarChart3, Crown, Zap, TrendingUp, Sparkles, ArrowUp, ImageIcon } from 'lucide-react';

interface UsageTrackerProps {
  tool: AllowanceKind;
  className?: string;
}

// Export the ref interface for external components to use
export interface UsageTrackerRef {
  refreshUsage: () => Promise<void>;
}

export const tierDisplayNames = {
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

export const tierColors = {
  free: 'bg-gray-100 text-gray-800 border-gray-200',
  kickstart: 'bg-blue-100 text-blue-800 border-blue-200',
  seo_takeover: 'bg-purple-100 text-purple-800 border-purple-200',
  agency: 'bg-amber-100 text-amber-800 border-amber-200',
  admin: 'bg-green-100 text-green-800 border-green-200',
};

const NEXT_TIER: Record<string, 'kickstart' | 'seo_takeover' | 'agency' | null> = {
  free: 'kickstart',
  kickstart: 'seo_takeover',
  seo_takeover: 'agency',
  agency: null,
  admin: null,
};

const TOOL_TITLES: Record<AllowanceKind, string> = {
  articles: 'Article Generation',
  keywords: 'Keyword Generation',
  thumbnails: 'Thumbnail Photos',
};

/** What the next plan gives, from the same limits the server enforces. */
function nextTierPitch(next: 'kickstart' | 'seo_takeover' | 'agency'): string {
  const limits = USAGE_LIMITS[next];
  if (limits.articles === 'unlimited') return 'unlimited articles and thumbnails';
  return `${limits.articles} articles and ${limits.thumbnails} thumbnail photos a month`;
}

/** Plan allowance and purchased extras as one bar, for the month. */
function AllowanceBar({ allowance, tone }: { allowance: Allowance; tone: string }) {
  if (allowance.unlimited) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-2 w-full rounded-full bg-green-100">
          <div className="h-2 w-full rounded-full bg-green-500" />
        </div>
        <span className="whitespace-nowrap text-xs font-medium text-green-600">Unlimited</span>
      </div>
    );
  }
  const percentage = allowance.planLimit > 0 ? Math.min(100, (allowance.planUsed / allowance.planLimit) * 100) : 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
        <span>
          {Math.min(allowance.planUsed, allowance.planLimit)} of {allowance.planLimit} used
        </span>
        <span>
          {allowance.planLeft} left
          {allowance.credits > 0 && <span className="font-medium text-blue-700"> + {allowance.credits} extra</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div className={`h-2 rounded-full transition-all duration-300 ${tone}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

const UsageTracker = forwardRef<UsageTrackerRef, UsageTrackerProps>(({ tool, className = '' }, ref) => {
  const { user, subscription_status } = useAuth();
  const tier = subscription_status || 'free';
  const { registerRefreshFunction, unregisterRefreshFunction } = useUsageRefresh();
  const { allowance, refresh } = useAllowance(tool);
  // Photos ride along on the articles tracker, since articles are where most of them go.
  const { allowance: photos, refresh: refreshPhotos } = useAllowance('thumbnails');
  const [resetInfo, setResetInfo] = useState<{ resetText: string; canGenerateNow: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    getResetInfo(user.uid, tier)
      .then(setResetInfo)
      .catch((error) => console.error('Error loading usage info:', error));
  }, [user, tier]);

  const refreshUsageData = useCallback(async () => {
    await Promise.all([refresh(), tool === 'articles' ? refreshPhotos() : Promise.resolve()]);
  }, [refresh, refreshPhotos, tool]);

  useImperativeHandle(ref, () => ({ refreshUsage: refreshUsageData }));

  useEffect(() => {
    registerRefreshFunction(tool, refreshUsageData);
    return () => unregisterRefreshFunction(tool);
  }, [tool, registerRefreshFunction, unregisterRefreshFunction, refreshUsageData]);

  if (!user || !allowance || !resetInfo) {
    return <div className={`h-24 animate-pulse rounded-lg bg-gray-100 ${className}`} />;
  }

  const TierIcon = tierIcons[tier as keyof typeof tierIcons] ?? BarChart3;
  const next = NEXT_TIER[tier] ?? null;
  const isFree = tier === 'free';
  const planOut = !allowance.unlimited && allowance.planLeft === 0;
  const allOut = planOut && allowance.credits === 0;
  const onCredits = planOut && allowance.credits > 0;
  const isNearLimit =
    !allowance.unlimited && !isFree && !planOut && allowance.planLimit > 0 && allowance.planUsed / allowance.planLimit >= 0.8;
  const cannotGenerateNow = isFree && tool === 'articles' && !resetInfo.canGenerateNow;
  const blocked = allOut || cannotGenerateNow;
  const noun = (n: number) => allowanceNoun(tool, n);

  const tone = blocked ? 'bg-red-500' : onCredits || isNearLimit ? 'bg-yellow-500' : 'bg-blue-500';
  const background = blocked ? 'bg-red-50 border-red-200' : isNearLimit ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200';

  const message = (() => {
    if (blocked) {
      return {
        title: 'Monthly limit reached',
        body: `You've used all ${allowance.planLimit} ${noun(allowance.planLimit)} on the ${tierDisplayNames[tier as keyof typeof tierDisplayNames] ?? tier} plan this month.`,
        action: allowance.canBuy
          ? `Top up below, or ${next ? `upgrade for ${nextTierPitch(next)}` : 'wait for next month'}.`
          : next
            ? `Upgrade to ${tierDisplayNames[next]} for ${nextTierPitch(next)}.`
            : 'Your allowance resets next month.',
      };
    }
    if (onCredits) {
      return {
        title: 'Using your extras',
        body: `This month's plan allowance is used. You have ${allowance.credits} extra ${noun(allowance.credits)} left, and they never expire.`,
        action: null,
      };
    }
    if (isNearLimit) {
      return {
        title: 'Running low',
        body: `You have ${allowance.planLeft} ${noun(allowance.planLeft)} left this month${allowance.credits ? `, plus ${allowance.credits} extra` : ''}.`,
        action: next ? `Upgrade to ${tierDisplayNames[next]} for ${nextTierPitch(next)}.` : null,
      };
    }
    return null;
  })();

  const messageTone = blocked
    ? ['bg-red-50 border-red-200', 'text-red-700', 'text-red-600']
    : ['bg-yellow-50 border-yellow-200', 'text-yellow-700', 'text-yellow-600'];

  return (
    <div className={`rounded-lg border p-4 ${background} ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <TierIcon className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">{TOOL_TITLES[tool]}</span>
        </div>
        <div className={`rounded-full border px-2 py-1 text-xs font-medium ${tierColors[tier as keyof typeof tierColors] ?? tierColors.free}`}>
          {tierDisplayNames[tier as keyof typeof tierDisplayNames] ?? tier}
        </div>
      </div>

      <AllowanceBar allowance={allowance} tone={tone} />

      {tool === 'articles' && photos?.included && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-gray-400" /> Thumbnail photos
          </span>
          <span>
            {photos.unlimited ? (
              'Unlimited'
            ) : (
              <>
                {photos.planLeft} of {photos.planLimit} left
                {photos.credits > 0 && <span className="font-medium text-blue-700"> + {photos.credits} extra</span>}
              </>
            )}
          </span>
        </div>
      )}

      {message ? (
        <div className={`mt-3 rounded-md border p-3 ${onCredits ? 'border-blue-200 bg-blue-50' : messageTone[0]}`}>
          <p className={`text-xs font-medium ${onCredits ? 'text-blue-700' : messageTone[1]}`}>{message.title}</p>
          <p className={`mt-1 text-xs ${onCredits ? 'text-blue-600' : messageTone[2]}`}>{message.body}</p>
          {message.action && <p className={`mt-1 text-xs font-medium ${messageTone[1]}`}>{message.action}</p>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500">{resetInfo.resetText}</p>
      )}

      {blocked && allowance.canBuy && tool !== 'keywords' && (
        <div className="mt-3">
          <BuyCredits kind={tool === 'articles' ? 'articles' : 'images'} returnTo={tool === 'articles' ? '/dashboard/articles' : '/dashboard/generate-thumbnail'} />
        </div>
      )}

      {(isFree || ((isNearLimit || blocked) && next)) && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <Link
            href="/pricing"
            className={`inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-xs font-medium text-white transition-colors ${
              isFree ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isFree ? (
              <>
                <Crown className="mr-1 h-3 w-3" />
                Upgrade for {nextTierPitch('kickstart')}
              </>
            ) : (
              <>
                <ArrowUp className="mr-1 h-3 w-3" />
                Upgrade to {next ? tierDisplayNames[next] : ''}
              </>
            )}
          </Link>
        </div>
      )}
    </div>
  );
});

UsageTracker.displayName = 'UsageTracker';

export default UsageTracker;
