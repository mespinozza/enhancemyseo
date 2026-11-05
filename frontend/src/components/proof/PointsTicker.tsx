'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CalendarClock, Gift, Link2, ShoppingBag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SellingPoint } from '@/lib/proof/content';

const ICONS: Record<SellingPoint['icon'], LucideIcon> = {
  chart: BarChart3,
  shopify: ShoppingBag,
  schedule: CalendarClock,
  links: Link2,
  free: Gift,
};

const INTERVAL_MS = 2800;

/**
 * The hero's eyebrow pill, cycling through selling points. Every item shares one grid
 * cell, so the pill is as wide as the longest point and never jumps as they change.
 */
export default function PointsTicker({ points }: { points: SellingPoint[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (points.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % points.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [points.length]);

  return (
    <span className="inline-grid max-w-full overflow-hidden rounded-full bg-blue-100 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
      {points.map((point, i) => {
        const Icon = ICONS[point.icon];
        const position =
          i === index
            ? 'translate-y-0 opacity-100'
            : i === (index - 1 + points.length) % points.length
              ? '-translate-y-full opacity-0'
              : 'translate-y-full opacity-0';
        return (
          <span
            key={point.label}
            aria-hidden={i !== index}
            className={`col-start-1 row-start-1 flex items-center gap-2 whitespace-nowrap transition-all duration-500 ease-out motion-reduce:transition-none ${position}`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            {point.label}
          </span>
        );
      })}
    </span>
  );
}
