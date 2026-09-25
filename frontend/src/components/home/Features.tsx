'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileText,
  Hash,
  Package,
  PenLine,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  cardStatesAt,
  DEMO_CARDS,
  LOOP_MS,
  restStates,
  REST_FRAME,
  typeOut,
  type DemoIcon,
} from '@/lib/home/demo';
import LiveCard from './LiveCard';
import { useSectionClock } from './useSectionClock';

const ICONS: Record<DemoIcon, LucideIcon> = {
  article: FileText,
  schedule: CalendarClock,
  traffic: TrendingUp,
  shopify: ShoppingBag,
  keywords: Hash,
  catalog: Package,
  brand: Building2,
  editor: PenLine,
};

/** Rotated in the heading. Kept from the previous design, now off the shared clock. */
const CONTEXT_WORDS = ['context-aware', 'informed', 'automated', 'hands-off'];
const WORD_MS = 3_000;

export default function Features() {
  const router = useRouter();
  const { user } = useAuth();
  const { containerRef, elapsed, animated } = useSectionClock(REST_FRAME);

  // Derived, never stored: one clock is the only thing that advances.
  const states = animated ? cardStatesAt(elapsed) : restStates();
  const wordIndex = animated
    ? Math.floor(elapsed / WORD_MS) % CONTEXT_WORDS.length
    : 0;
  const midWord = animated && elapsed % WORD_MS > WORD_MS - 400;

  const handleGenerateClick = () => {
    router.push(user ? '/dashboard' : '/register');
  };

  return (
    // scroll-mt clears the sticky header when the hero's Learn More jumps here.
    <section id="features" className="relative scroll-mt-24 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600 motion-reduce:animate-none" />
            Built and running today
          </span>

          <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
            We&apos;ve built the world&apos;s most{' '}
            <span
              className={`inline-block text-blue-600 transition-opacity duration-300 ${
                midWord ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {CONTEXT_WORDS[wordIndex]}
            </span>{' '}
            SEO suite.
          </h2>

          <p className="mt-3 text-gray-600">
            Watch one scheduled run move through the whole pipeline: a topic becomes a
            buyer-intent keyword, your products get pulled in, the draft is written and
            fact-checked, and it lands in your Shopify blog.
          </p>
        </div>

        <div
          ref={containerRef}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {DEMO_CARDS.map((card, index) => {
            const state = states[card.id];
            return (
              <LiveCard
                key={card.id}
                index={index}
                icon={ICONS[card.icon]}
                title={card.title}
                bullets={card.bullets}
                featured={card.featured}
                locked={card.locked}
                done={state.done}
                active={state.active}
                // Without motion the line is shown whole rather than mid-keystroke.
                status={animated ? typeOut(state.status, state.statusSince) : state.status}
              />
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <button
            onClick={handleGenerateClick}
            className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            {user ? 'Open your dashboard' : 'Start generating'}
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <p className="text-sm text-gray-500">
            {Math.round(LOOP_MS / 1000)} seconds, start to published.
          </p>
        </div>
      </div>

      <style jsx>{`
        section :global(.home-card) {
          animation: home-card-in 500ms ease-out both;
        }

        @keyframes home-card-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          section :global(.home-card) {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
