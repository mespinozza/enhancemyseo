'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  Gauge,
  LineChart,
  Loader2,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { createCheckoutSession, DONE_FOR_YOU } from '@/lib/stripe';

export const INCLUDED: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Wrench, title: 'Technical SEO audit & fixes', body: 'Speed, indexing, schema and site structure, fixed for you.' },
  { icon: Search, title: 'Keyword & competitor strategy', body: 'The searches your buyers make, mapped to your pages.' },
  { icon: Gauge, title: 'Product & collection optimization', body: 'Titles, descriptions and meta rewritten to rank and convert.' },
  { icon: FileText, title: 'Unlimited blog content, managed', body: 'Automations set up, articles written, reviewed and published.' },
  { icon: Bot, title: 'AEO & GEO', body: 'Content shaped to be cited by ChatGPT, Perplexity and AI Overviews.' },
  { icon: LineChart, title: 'Monthly report & strategy call', body: 'Rankings, traffic and next moves, reviewed with you.' },
];

/**
 * The done-for-you offer that sits under the self-serve plans. Checkout goes straight
 * to Stripe, the same way the plans do, so a buyer can start without a sales call.
 */
export default function DoneForYouOffer({ className = '' }: { className?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    if (!DONE_FOR_YOU.priceId) {
      router.push('/contact');
      return;
    }

    try {
      (window as Window & { fbq?: (...args: unknown[]) => void }).fbq?.('track', 'InitiateCheckout', {
        value: DONE_FOR_YOU.monthlyPrice,
        currency: 'USD',
        content_name: `${DONE_FOR_YOU.name} Monthly`,
        num_items: 1,
      });
    } catch { /* pixel not ready — safe to ignore */ }

    if (!user) {
      const params = new URLSearchParams({
        intent: 'purchase',
        priceId: DONE_FOR_YOU.priceId,
        tierName: DONE_FOR_YOU.name,
        isAnnual: 'false',
      });
      router.push(`/login?${params.toString()}`);
      return;
    }

    setIsStarting(true);
    try {
      await createCheckoutSession(DONE_FOR_YOU.priceId, await user.getIdToken());
    } catch (error) {
      console.error('Done-for-you checkout error:', error);
      alert(`Payment Error: ${error instanceof Error ? error.message : 'Something went wrong. Please try again.'}`);
      setIsStarting(false);
    }
  };

  return (
    // A gradient frame that slowly pans, so the offer reads as the premium option
    // without shouting over the plans above it.
    <div
      className={`rounded-3xl bg-gradient-to-r from-blue-500 via-indigo-400 to-blue-500 bg-[length:200%_100%] p-[2px] shadow-2xl shadow-blue-600/20 animate-border-pan motion-reduce:animate-none ${className}`}
    >
      <div className="relative overflow-hidden rounded-[calc(1.5rem-2px)] bg-gray-950 p-5 text-white sm:p-8 lg:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(60% 70% at 100% 0%, rgba(59, 130, 246, 0.28), rgba(59, 130, 246, 0) 70%)',
              'radial-gradient(50% 60% at 0% 100%, rgba(99, 102, 241, 0.18), rgba(99, 102, 241, 0) 70%)',
            ].join(', '),
          }}
        />

        {/* Three children so phones get header, price, then the list, putting the
            checkout button on screen early. From lg the price box sits beside both. */}
        <div className="relative grid gap-6 lg:grid-cols-[1fr_20rem] lg:gap-x-10 lg:gap-y-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-300 ring-1 ring-inset ring-blue-400/30">
              <Sparkles className="h-3.5 w-3.5" />
              Done for you
            </span>
            <h3 className="mt-4 text-2xl font-bold sm:text-3xl">Your personal SEO team</h3>
            <p className="mt-2 max-w-xl text-gray-300">
              A dedicated strategist runs your entire SEO, powered by our platform. We
              optimize the site, automate the blog, and do whatever it takes to push your
              priority keywords toward page one.
            </p>
          </div>

          <div className="flex flex-col rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1 bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10 backdrop-blur sm:p-6">
            <p className="text-sm text-gray-400">
              Comparable agency retainers
              <span className="ml-1.5 text-gray-500 line-through">$5,000+/mo</span>
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-5xl font-bold tracking-tight">
                ${DONE_FOR_YOU.monthlyPrice.toLocaleString()}
              </span>
              <span className="text-gray-400">/month</span>
            </div>

            <ul className="mt-5 space-y-2 text-sm text-gray-300">
              {['Every service listed, handled for you', 'Unlimited platform access included', 'Kickoff call right after checkout'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 flex-shrink-0 text-green-400" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>

            <button
              onClick={handleStart}
              disabled={isStarting}
              className="group relative mt-6 inline-flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-blue-600/40 ring-1 ring-inset ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/50 disabled:cursor-wait disabled:opacity-80"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[300%] motion-reduce:hidden"
              />
              {isStarting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Get my SEO team
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              )}
            </button>
            <Link
              href="/contact"
              className="mt-3 text-center text-sm text-gray-400 transition-colors hover:text-white"
            >
              Questions first? Talk to us
            </Link>

            <p className="mt-auto pt-5 text-xs leading-relaxed text-gray-500">
              Billed monthly through Stripe. Running an agency or several brands?{' '}
              <Link href="/contact" className="text-gray-300 underline-offset-2 hover:underline">
                Ask about custom plans
              </Link>
              .
            </p>
          </div>

          {/* Phones get the titles only; the one-line explanations join from sm. */}
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 sm:gap-y-4">
            {INCLUDED.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-center gap-3 sm:items-start">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-blue-300 sm:mt-0.5">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="hidden text-sm text-gray-400 sm:block">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
