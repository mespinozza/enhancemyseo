import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';
import { CREDIT_PACKS, CREDIT_TIERS } from '@/lib/credits/packs';
import { getCredits } from '@/lib/credits/server';

export const dynamic = 'force-dynamic';

/** The caller's purchased credits, and whether their plan can buy more. */
export async function GET(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid, email } = auth.caller;
  const [credits, tier] = await Promise.all([getCredits(uid), getServerUserSubscriptionStatus(uid, email)]);
  return NextResponse.json({
    credits,
    canBuy: CREDIT_TIERS.includes(tier),
    packs: CREDIT_PACKS.map(({ id, kind, credits: amount, priceUsd, label }) => ({ id, kind, credits: amount, priceUsd, label })),
  });
}
