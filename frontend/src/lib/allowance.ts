'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getUserUsage, USAGE_LIMITS } from '@/lib/usage-limits';
import { fetchCredits } from '@/lib/credits/client';
import { CREDIT_TIERS } from '@/lib/credits/packs';
import { THUMBNAIL_TIERS } from '@/lib/thumbnail/types';

export type AllowanceKind = 'articles' | 'keywords' | 'thumbnails';

/**
 * What an account can still make this month: the plan's allowance, then purchased credits,
 * which are spent only once the allowance is used up and never expire.
 */
export interface Allowance {
  kind: AllowanceKind;
  tier: string;
  /** Whether the plan includes this at all; thumbnails need a paid plan. */
  included: boolean;
  unlimited: boolean;
  planLimit: number;
  planUsed: number;
  planLeft: number;
  credits: number;
  /** Plan allowance plus credits; Infinity when unlimited. */
  left: number;
  /** Whether the plan can top up with credit packs. */
  canBuy: boolean;
}

const USAGE_CHANGED = 'usage:changed';

/** Tells every allowance on the page to read again, after something was made. */
export const announceUsageChange = () => window.dispatchEvent(new Event(USAGE_CHANGED));

export function useAllowance(kind: AllowanceKind) {
  const { user, subscription_status } = useAuth();
  const tier = subscription_status || 'free';
  const [allowance, setAllowance] = useState<Allowance | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const canBuy = CREDIT_TIERS.includes(tier) && kind !== 'keywords';
    const [usage, credits] = await Promise.all([
      getUserUsage(user.uid).catch(() => null),
      canBuy ? fetchCredits(user).then((r) => r.credits).catch(() => null) : Promise.resolve(null),
    ]);
    const limit = USAGE_LIMITS[tier]?.[kind] ?? 0;
    const unlimited = limit === 'unlimited';
    const planLimit = unlimited ? 0 : limit;
    const raw = usage?.[kind];
    const planUsed = typeof raw === 'number' ? raw : 0;
    const planLeft = unlimited ? Infinity : Math.max(0, planLimit - planUsed);
    const extra = (kind === 'articles' ? credits?.articles : kind === 'thumbnails' ? credits?.images : 0) ?? 0;
    setAllowance({
      kind,
      tier,
      included: kind !== 'thumbnails' || THUMBNAIL_TIERS.includes(tier),
      unlimited,
      planLimit,
      planUsed,
      planLeft,
      credits: extra,
      left: unlimited ? Infinity : planLeft + extra,
      canBuy,
    });
  }, [user, tier, kind]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(USAGE_CHANGED, onChange);
    return () => window.removeEventListener(USAGE_CHANGED, onChange);
  }, [refresh]);

  return { allowance, refresh };
}

export const allowanceNoun = (kind: AllowanceKind, n: number) =>
  kind === 'articles'
    ? `article${n === 1 ? '' : 's'}`
    : kind === 'keywords'
      ? `keyword search${n === 1 ? '' : 'es'}`
      : `thumbnail photo${n === 1 ? '' : 's'}`;
const noun = allowanceNoun;

/** "48 of 50 thumbnail photos left this month, plus 20 extra" and the like. */
export function describeAllowance(a: Allowance): string {
  if (a.unlimited) return `Unlimited ${noun(a.kind, 2)} on your plan`;
  const base = `${a.planLeft} of ${a.planLimit} ${noun(a.kind, a.planLimit)} left this month`;
  return a.credits > 0 ? `${base}, plus ${a.credits} extra` : base;
}
