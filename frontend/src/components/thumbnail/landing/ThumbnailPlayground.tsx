'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ImageIcon } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { THUMBNAIL_LAYOUTS, type ThumbnailLayout } from '@/lib/thumbnail/design';
import { PLAYGROUND_COLORS, PLAYGROUND_DEFAULT_TITLE } from '@/lib/thumbnail/landing';
import { PRIMARY_CTA } from '@/components/proof/ProofProvider';
import ThumbnailCanvas from '@/components/thumbnail/ThumbnailCanvas';

const MAX_TITLE = 70;

/** The hero's try-it panel: the visitor's own headline, drawn live by the real renderer. */
export default function ThumbnailPlayground() {
  const { user } = useAuth();
  const [title, setTitle] = useState(PLAYGROUND_DEFAULT_TITLE);
  const [brand, setBrand] = useState('');
  const [layout, setLayout] = useState<ThumbnailLayout>('parts-plus');
  const [color, setColor] = useState(PLAYGROUND_COLORS[0]);
  const touched = useRef(false);

  const touch = (control: string) => {
    if (touched.current) return;
    touched.current = true;
    track('thumbnail_playground', { control });
  };

  const shown = title.trim() || PLAYGROUND_DEFAULT_TITLE;
  const href = user ? '/dashboard/generate-thumbnail' : '/login?signup=1';

  return (
    <div className="rounded-3xl bg-white/80 p-3 shadow-2xl shadow-blue-900/15 ring-1 ring-gray-200 backdrop-blur sm:p-4">
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/5">
        <ThumbnailCanvas
          title={shown}
          layout={layout}
          color={color}
          brand={brand.trim() || 'Your Brand'}
          seed={7}
          label={`Thumbnail preview: ${shown}`}
          eager
        />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <ImageIcon className="h-3.5 w-3.5" /> Live preview. Yours gets an AI photo for the topic.
        </span>
      </div>

      <div className="mt-4 space-y-3 px-1">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your article title</span>
            <input
              value={title}
              maxLength={MAX_TITLE}
              onChange={(event) => {
                touch('title');
                setTitle(event.target.value);
              }}
              className="mt-1 block w-full rounded-xl border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Brand</span>
            <input
              value={brand}
              maxLength={24}
              placeholder="Your Brand"
              onChange={(event) => {
                touch('brand');
                setBrand(event.target.value);
              }}
              className="mt-1 block w-full rounded-xl border-gray-200 bg-gray-50 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Thumbnail style">
            {THUMBNAIL_LAYOUTS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={layout === option.value}
                title={option.description}
                onClick={() => {
                  touch('layout');
                  setLayout(option.value);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  layout === option.value
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Brand colour">
            {PLAYGROUND_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={color === swatch}
                aria-label={`Colour ${swatch}`}
                onClick={() => {
                  touch('color');
                  setColor(swatch);
                }}
                className={`h-6 w-6 rounded-full ring-offset-2 transition ${
                  color === swatch ? 'ring-2 ring-gray-900' : 'ring-1 ring-black/10 hover:scale-110'
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>

        <Link
          href={href}
          onClick={() => track('cta_click', { location: 'playground', label: 'Make it for my article', target: 'signup' })}
          className={`${PRIMARY_CTA} w-full`}
        >
          Make it for my article
          <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
