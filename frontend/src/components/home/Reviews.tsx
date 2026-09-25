'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  REVIEW_MS,
  REVIEWS,
  reviewIndexAt,
  reviewProgressAt,
} from '@/lib/home/reviews';
import ReviewCard from './ReviewCard';
import { useSectionClock } from './useSectionClock';

export default function Reviews() {
  // Where the rotation last restarted. Pressing next or picking a dot moves the
  // baseline to now, which hands the reader a full slide rather than the remainder of
  // the one they interrupted.
  const [from, setFrom] = useState({ at: 0, index: 0 });
  const [held, setHeld] = useState(false);

  const { containerRef, elapsed, animated } = useSectionClock(0, { paused: held });

  const since = animated ? elapsed - from.at : 0;
  const index = reviewIndexAt(since, from.index, REVIEWS.length);
  // No special case for hovering: the clock itself is held, so the bar simply stops.
  const progress = animated ? reviewProgressAt(since) : 0;

  const goTo = (next: number) => {
    const count = REVIEWS.length;
    setFrom({ at: elapsed, index: ((next % count) + count) % count });
  };

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Trusted by Successful Store Owners
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            See how our AI-powered content solution is helping e-commerce businesses grow
          </p>
        </div>

        <div
          ref={containerRef}
          className="mx-auto max-w-3xl"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
        >
          {/* A grid of one cell: every slide stacks in it, so the stage is as tall as
              the longest quote and nothing is cut off when a shorter one is showing. */}
          <div className="grid">
            {REVIEWS.map((review, position) => (
              <ReviewCard key={review.id} review={review} current={position === index} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous review"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              {REVIEWS.map((review, position) => {
                const active = position === index;
                return (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => goTo(position)}
                    aria-label={`Review ${position + 1} of ${REVIEWS.length}`}
                    aria-current={active}
                    className={`h-1.5 overflow-hidden rounded-full transition-all duration-300 ${
                      active ? 'w-8 bg-gray-200' : 'w-1.5 bg-gray-300 hover:bg-gray-400'
                    }`}
                  >
                    {/* The active dot doubles as the countdown to the next slide. */}
                    <span
                      className="block h-full rounded-full bg-blue-600"
                      style={{ width: active ? `${Math.round(progress * 100)}%` : '0%' }}
                    />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next review"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
