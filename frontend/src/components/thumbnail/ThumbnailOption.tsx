'use client';

import Link from 'next/link';
import { AlertTriangle, ImageIcon, Lock } from 'lucide-react';
import BuyCredits from '@/components/credits/BuyCredits';
import { describeAllowance, useAllowance } from '@/lib/allowance';
import { THUMBNAIL_LAYOUTS, type ThumbnailLayout } from '@/lib/thumbnail/design';

/**
 * "Add a thumbnail to each article", for generating by hand and for automations. Shows the
 * photos left on the plan and in purchased credits against what the run would need, and
 * points free accounts at a plan rather than offering a switch that would do nothing.
 */
export default function ThumbnailOption({
  enabled,
  onEnabledChange,
  layout,
  onLayoutChange,
  needed,
  context,
  returnTo,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  layout: ThumbnailLayout;
  onLayoutChange: (layout: ThumbnailLayout) => void;
  /** Photos the request would use: articles in this run, or a month of the schedule. */
  needed: number;
  context: 'articles' | 'automation';
  returnTo: string;
}) {
  const { allowance } = useAllowance('thumbnails');
  if (!allowance) return null;

  if (!allowance.included) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-gray-700">Add a thumbnail to each article</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Paid plans design a featured image for every article, with a photo for the topic, your brand colour and the
            title, sent to Shopify with it.{' '}
            <Link href="/pricing" className="font-semibold text-blue-600 hover:underline">
              See plans
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const short = !allowance.unlimited && enabled && needed > allowance.left;
  const empty = !allowance.unlimited && allowance.left === 0;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="min-w-0 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-gray-900">
            <ImageIcon className="h-4 w-4 text-blue-600" />
            {context === 'articles' ? 'Add a thumbnail to each article' : 'Make a thumbnail for each article'}
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            A photo for the topic with your brand colour, title and logo, set as the featured image and sent with the Shopify
            push. Edit any of them later in the Thumbnail studio.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2 pl-7">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Thumbnail style">
            {THUMBNAIL_LAYOUTS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={layout === option.value}
                title={option.description}
                onClick={() => onLayoutChange(option.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  layout === option.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-blue-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            {describeAllowance(allowance)}.{' '}
            {context === 'articles'
              ? `Uses 1 photo per article${needed > 1 ? `, ${needed} for this run` : ''}.`
              : `Uses 1 photo per article, about ${needed} a month on this schedule.`}
          </p>
          {(short || empty) && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {context === 'articles'
                ? empty
                  ? 'No thumbnail photos left this month. The articles are still written, without one.'
                  : `Only ${allowance.left} left: the first ${allowance.left} article${allowance.left === 1 ? '' : 's'} get one, the rest are written without.`
                : 'That is more than you have left this month. Once photos run out, articles still publish, without a thumbnail, until next month or a top-up.'}
            </p>
          )}
          {(short || empty) && allowance.canBuy && (
            <BuyCredits kind="images" compact returnTo={returnTo} />
          )}
        </div>
      )}
    </div>
  );
}
