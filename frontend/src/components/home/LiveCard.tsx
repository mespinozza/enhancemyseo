'use client';

import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DemoBullet } from '@/lib/home/demo';

export interface LiveCardProps {
  icon: LucideIcon;
  title: string;
  bullets: DemoBullet[];
  /** Bullet ids finished so far in this pass of the demo. */
  done: string[];
  active: boolean;
  status: string;
  featured?: boolean;
  /** Staggers the entrance so the grid assembles rather than appearing at once. */
  index: number;
}

/**
 * One capability, as a tile.
 *
 * Presentational on purpose: it holds no timers and no script knowledge, so the same
 * component renders the animated grid and the static frame a reduced-motion visitor
 * sees. Everything that moves is driven by props from the one clock above it.
 */
export default function LiveCard({
  icon: Icon,
  title,
  bullets,
  done,
  active,
  status,
  featured = false,
  index,
}: LiveCardProps) {
  return (
    // A plain anchor rather than a router link: every card sends the reader to pricing,
    // and the global `scroll-behavior: smooth` makes that work before hydration.
    <a
      href="#pricing"
      style={{ animationDelay: `${index * 70}ms` }}
      className={`group home-card flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        active ? 'border-blue-300 shadow-blue-100' : 'border-gray-200'
      } ${featured ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-300 ${
              active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>

        {/* A state indicator, not a control: the page is a demo, so it must not invite a click. */}
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-300 ${
            active ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ${
              active ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
      </div>

      <ul className={`mt-4 flex-1 space-y-2 ${featured ? 'sm:columns-2 sm:space-y-0' : ''}`}>
        {bullets.map((bullet) => {
          const complete = done.includes(bullet.id);
          return (
            <li
              key={bullet.id}
              className={`flex items-start gap-2 text-xs leading-5 transition-colors duration-500 ${
                featured ? 'sm:mb-2 sm:break-inside-avoid' : ''
              } ${complete ? 'text-gray-900' : 'text-gray-500'}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${
                  complete ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'
                }`}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {bullet.label}
            </li>
          );
        })}
      </ul>

      {/* Fixed height and truncation: a status line that grows would reflow the whole
          grid every few hundred milliseconds. */}
      <div className="mt-4 flex h-5 items-center gap-2 border-t border-gray-100 pt-3 text-xs">
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full motion-reduce:animate-none ${
            active ? 'animate-pulse bg-green-500' : 'bg-gray-300'
          }`}
        />
        <span
          aria-hidden="true"
          className={`truncate ${active ? 'text-gray-700' : 'text-gray-400'}`}
        >
          {status}
        </span>
      </div>
    </a>
  );
}
