'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowRight, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { buyPack, creditNoun, fetchCredits, type CreditsResponse } from '@/lib/credits/client';
import type { CreditKind } from '@/lib/credits/packs';

/**
 * Extra credit packs for one kind, or both. Free accounts are pointed at a plan instead,
 * since packs top up a plan's allowance rather than replace it.
 */
export default function BuyCredits({
  kind,
  returnTo,
  title,
  compact = false,
}: {
  kind?: CreditKind;
  returnTo: string;
  title?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchCredits(user).then(setData).catch(() => setData(null));
  }, [user]);

  if (!user || !data) return null;
  const packs = data.packs.filter((pack) => !kind || pack.kind === kind);

  const buy = async (id: (typeof packs)[number]['id']) => {
    setBuying(id);
    track('credit_pack_checkout', { pack: id, from: returnTo });
    try {
      await buyPack(user, id, returnTo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start checkout');
      setBuying(null);
    }
  };

  return (
    <div className={compact ? 'rounded-xl border border-amber-200 bg-amber-50 p-4' : ''}>
      {title && <p className="text-sm font-semibold text-gray-900">{title}</p>}
      <p className="mt-0.5 text-sm text-gray-600">
        {!data.canBuy
          ? 'Extra packs top up a paid plan. Pick a plan to get more each month.'
          : kind
            ? `You have ${creditNoun(kind, data.credits[kind])} left. Extras are used after your monthly allowance and never expire.`
            : `You have ${creditNoun('articles', data.credits.articles)} and ${creditNoun('images', data.credits.images)} for thumbnails. Extras are used after your monthly allowance and never expire.`}
      </p>
      {data.canBuy ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => buy(pack.id)}
              disabled={buying !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
            >
              {buying === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {pack.label}
              <span className="font-semibold text-gray-900">${pack.priceUsd}</span>
            </button>
          ))}
        </div>
      ) : (
        <Link
          href="/pricing"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          See plans <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
