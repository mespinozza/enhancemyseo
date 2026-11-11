'use client';

import { Check, TrendingUp } from 'lucide-react';
import { THUMBNAIL_LAYOUTS, type ThumbnailLayout } from '@/lib/thumbnail/design';
import ThumbnailCanvas from './ThumbnailCanvas';

const FALLBACK_TITLE = 'Your Article Title Here';

/**
 * The thumbnail styles as small live previews, drawn with the account's own title and brand
 * colour, so choosing one is choosing a look rather than reading a description.
 */
export default function StylePicker({
  value,
  onChange,
  title,
  color,
  brand,
  disabled = false,
  columns = 2,
}: {
  value: ThumbnailLayout;
  onChange: (layout: ThumbnailLayout) => void;
  title?: string;
  color?: string;
  brand?: string;
  disabled?: boolean;
  /** 2 for narrow panels; 4 spreads across a wide form on larger screens. */
  columns?: 2 | 4;
}) {
  const shown = title?.trim() || FALLBACK_TITLE;

  return (
    <div
      role="radiogroup"
      aria-label="Thumbnail style"
      className={`grid grid-cols-2 gap-2 ${columns === 4 ? 'sm:grid-cols-4' : ''}`}
    >
      {THUMBNAIL_LAYOUTS.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.description}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`group relative overflow-hidden rounded-lg bg-white text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? 'ring-2 ring-blue-600 shadow-md' : 'ring-1 ring-gray-200 hover:ring-blue-300 hover:shadow-sm'
            }`}
          >
            <ThumbnailCanvas
              title={shown}
              layout={option.value}
              color={color || '#2563eb'}
              brand={brand}
              seed={index + 5}
              label={`${option.label} style preview`}
              eager
            />
            <span className={`block truncate px-2 py-1.5 text-xs font-medium ${selected ? 'text-blue-700' : 'text-gray-700'}`}>
              {option.label}
            </span>
            {option.value === 'parts-plus' && (
              <span
                title="The format behind our case study's 3M+ impressions"
                className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow"
              >
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                3M+ impressions
              </span>
            )}
            {selected && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
