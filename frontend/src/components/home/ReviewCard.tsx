'use client';

import { BadgeCheck, Quote, Star } from 'lucide-react';
import { maskSurname, starFills, type Review } from '@/lib/home/reviews';

export interface ReviewCardProps {
  review: Review;
  /** The slide currently showing. The rest stay mounted, faded out behind it. */
  current: boolean;
}

/**
 * One testimonial.
 *
 * Every slide stays in the same grid cell rather than sitting in a row that slides
 * sideways. The stack sizes itself to the longest quote, so no card is ever cut off at
 * the bottom, and there is no overflow clip to crop the shadow.
 */
export default function ReviewCard({ review, current }: ReviewCardProps) {
  return (
    <figure
      aria-hidden={!current}
      className={`col-start-1 row-start-1 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-500 sm:p-8 ${
        current
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0'
      } motion-reduce:translate-y-0 motion-reduce:transition-none`}
    >
      <Quote className="h-7 w-7 text-blue-100" aria-hidden="true" />

      <blockquote className="mt-3 text-base leading-relaxed text-gray-700 sm:text-lg">
        {review.text}
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-4 border-t border-gray-100 pt-5">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-400 text-lg font-semibold text-white">
          {review.firstName.charAt(0)}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-gray-900">
              {review.firstName} {maskSurname(review.lastName)}
            </span>
            <span className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
              {starFills(review.rating).map((fill, index) => (
                <Star
                  key={index}
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${
                    fill === 'empty'
                      ? 'text-gray-200'
                      : `fill-yellow-400 text-yellow-400${fill === 'half' ? ' opacity-50' : ''}`
                  }`}
                />
              ))}
            </span>
          </div>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500">
            <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" aria-hidden="true" />
            Verified {review.revenueRange} Shopify store owner
            <span aria-hidden="true">•</span>
            {review.storeType}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
