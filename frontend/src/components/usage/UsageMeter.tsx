'use client';

import Link from 'next/link';
import { ImageIcon } from 'lucide-react';
import { useAllowance, type Allowance, type AllowanceKind } from '@/lib/allowance';
import { tierColors, tierDisplayNames } from './UsageTracker';

const LABELS: Record<AllowanceKind, string> = {
  articles: 'Articles',
  keywords: 'Keyword searches',
  thumbnails: 'Thumbnail photos',
};

/**
 * A one-line version of the usage tracker for tool headers: the month's allowance as a short
 * bar, with a way to get more only once it is running out.
 */
export default function UsageMeter({ kind, onTopUp }: { kind: AllowanceKind; onTopUp?: () => void }) {
  const { allowance } = useAllowance(kind);
  if (!allowance) return <div className="h-[3.25rem] w-60 animate-pulse rounded-lg bg-gray-100" />;
  return <UsageMeterView allowance={allowance} onTopUp={onTopUp} />;
}

export function UsageMeterView({ allowance, onTopUp }: { allowance: Allowance; onTopUp?: () => void }) {
  const kind = allowance.kind;
  const tier = allowance.tier as keyof typeof tierDisplayNames;
  const out = !allowance.unlimited && allowance.left === 0;
  const low =
    !allowance.unlimited && !out && allowance.planLimit > 0 && allowance.planUsed / allowance.planLimit >= 0.8 && allowance.credits === 0;
  const percent = allowance.unlimited
    ? 100
    : allowance.planLimit > 0
      ? Math.min(100, (allowance.planUsed / allowance.planLimit) * 100)
      : 100;
  const tone = allowance.unlimited ? 'bg-green-500' : out ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div
      className={`w-60 rounded-lg border px-3 py-2 shadow-sm ${out ? 'border-red-200 bg-red-50' : low ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}
      title="Resets monthly. Extras never expire."
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
          {LABELS[kind]}
        </span>
        <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${tierColors[tier] ?? tierColors.free}`}>
          {tierDisplayNames[tier] ?? allowance.tier}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full transition-all duration-300 ${tone}`} style={{ width: `${percent}%` }} />
        </div>
        <span className={`whitespace-nowrap text-[11px] ${out ? 'font-medium text-red-700' : 'text-gray-600'}`}>
          {allowance.unlimited ? (
            <span className="font-medium text-green-600">Unlimited</span>
          ) : (
            <>
              {allowance.planLeft} of {allowance.planLimit} left
              {allowance.credits > 0 && <span className="font-medium text-blue-700"> +{allowance.credits}</span>}
            </>
          )}
        </span>
        {out && allowance.canBuy && onTopUp ? (
          <button type="button" onClick={onTopUp} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
            Top up
          </button>
        ) : (
          (out || low) && (
            <Link href="/pricing" className="text-[11px] font-semibold text-blue-600 hover:text-blue-800">
              Upgrade
            </Link>
          )
        )}
      </div>
    </div>
  );
}
