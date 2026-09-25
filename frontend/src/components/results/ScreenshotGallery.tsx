'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CaseStudyScreenshot } from '@/lib/results/types';

/**
 * Search Console screenshots are the evidence, and at card size the axis labels are
 * unreadable, so each one opens full size and the lightbox steps through the set.
 */
export default function ScreenshotGallery({ shots }: { shots: CaseStudyScreenshot[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const step = useCallback(
    (direction: -1 | 1) => {
      setOpen((current) => {
        if (current === null) return current;
        return (current + direction + shots.length) % shots.length;
      });
    },
    [shots.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);

    // The page behind shouldn't scroll while an image is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, step]);

  if (shots.length === 0) return null;

  // A lone screenshot shouldn't be squeezed into half the width, and past four the
  // thumbnails are browsing aids rather than the main event.
  const columns =
    shots.length === 1 ? '' : shots.length > 4 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <>
      <div className={`grid gap-6 ${columns}`}>
        {shots.map((shot, index) => (
          // Positional key as well as the URL, so repeating an image doesn't collide.
          // Screenshots are rarely the same shape, so the figure stretches to the tallest
          // in its row and the caption takes up the slack — otherwise short captions leave
          // a gap between the white strip and the card border.
          <figure
            key={`${shot.url}-${index}`}
            className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="block w-full cursor-zoom-in bg-gray-50"
              aria-label={`Open ${shot.caption || `screenshot ${index + 1}`} full size`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={shot.caption || `Search Console screenshot ${index + 1}`}
                loading="lazy"
                className="w-full object-cover"
              />
            </button>
            {shot.caption && (
              <figcaption className="flex-1 border-t border-gray-100 bg-white px-4 py-3 text-sm text-gray-600">
                {shot.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {/* Portalled to the body: the sticky site header is also z-50, and nesting the
          overlay inside the page content leaves it fighting for the same layer. */}
      {open !== null &&
        mounted &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={shots[open].caption || 'Screenshot'}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-10"
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

            {shots.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    step(-1);
                  }}
                  className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-6 sm:p-3"
                  aria-label="Previous screenshot"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    step(1);
                  }}
                  className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-6 sm:p-3"
                  aria-label="Next screenshot"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}

            <figure
              className="flex max-h-full flex-col items-center gap-3"
              onClick={(event) => event.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shots[open].url}
                alt={shots[open].caption || `Search Console screenshot ${open + 1}`}
                className="min-h-0 max-w-full flex-1 rounded-lg object-contain"
              />
              <figcaption className="text-center text-sm text-white/80">
                {shots[open].caption && <span className="mr-2">{shots[open].caption}</span>}
                {shots.length > 1 && (
                  <span className="tabular-nums text-white/50">
                    {open + 1} / {shots.length}
                  </span>
                )}
              </figcaption>
            </figure>
          </div>,
          document.body
        )}
    </>
  );
}
