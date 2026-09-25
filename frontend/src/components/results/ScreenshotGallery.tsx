'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CaseStudyScreenshot } from '@/lib/results/types';

/**
 * Search Console screenshots are the evidence, and at card size the axis labels are
 * unreadable, so each one opens full size.
 */
export default function ScreenshotGallery({ shots }: { shots: CaseStudyScreenshot[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (shots.length === 0) return null;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {shots.map((shot, index) => (
          <figure key={shot.url} className="overflow-hidden rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="block w-full cursor-zoom-in bg-gray-50"
              aria-label={`Open ${shot.caption || 'screenshot'} full size`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={shot.caption || 'Search Console screenshot'}
                loading="lazy"
                className="w-full object-cover"
              />
            </button>
            {shot.caption && (
              <figcaption className="border-t border-gray-100 bg-white px-4 py-3 text-sm text-gray-600">
                {shot.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={shots[open].caption || 'Screenshot'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shots[open].url}
            alt={shots[open].caption || 'Search Console screenshot'}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
