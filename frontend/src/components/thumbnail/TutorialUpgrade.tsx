'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Link2, ListTree, Loader2, Lock, PartyPopper, Shield, TrendingUp } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { PLANS } from '@/lib/plans';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { createCheckoutSession, getPriceId } from '@/lib/stripe';
import type { ArticleStats } from '@/lib/thumbnail/tutorial-pending';

type PaidKey = 'kickstart' | 'seo_takeover';

const monthly = (key: PaidKey | 'free') => {
  const limit = USAGE_LIMITS[key].articles;
  return typeof limit === 'number' ? limit : 0;
};

/**
 * The tutorial's upgrade offer, with annual billing chosen since it saves 20%. Shown before
 * the free first article is written ("ready": everything is in place, and a plan adds its
 * thumbnail) and again once it is ("written": what that one article holds). Both show what
 * a plan's pace adds up to over a year and go straight to checkout.
 */
export default function TutorialUpgrade({
  variant = 'written',
  preview,
  stats,
  ready = [],
  onDismiss,
  onBack,
  onBeforeCheckout,
  cancelPath,
}: {
  variant?: 'ready' | 'written';
  /** The thumbnail mock-up and its style picker. */
  preview: ReactNode;
  stats?: ArticleStats;
  /** What the tutorial has collected, for the "ready" variant. */
  ready?: string[];
  onDismiss: () => void;
  onBack?: () => void;
  /** Awaited before leaving for Stripe, to keep what the return needs. */
  onBeforeCheckout?: () => Promise<void> | void;
  cancelPath?: string;
}) {
  const before = variant === 'ready';
  const { user } = useAuth();
  const [planKey, setPlanKey] = useState<PaidKey>('kickstart');
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const plan = PLANS.find((p) => p.key === planKey)!;
  const yearlyAtMonthly = plan.monthlyPrice * 12;
  const saving = yearlyAtMonthly - plan.annualTotal;
  const perMonth = annual ? plan.annualMonthlyPrice : plan.monthlyPrice;

  const runway = (['free', 'kickstart', 'seo_takeover'] as const).map((key) => ({
    key,
    name: key === 'free' ? 'Free' : PLANS.find((p) => p.key === key)!.name,
    perMonth: monthly(key),
    perYear: monthly(key) * 12,
  }));
  const maxYear = Math.max(...runway.map((r) => r.perYear));

  const checkout = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    track('tutorial_upgrade_checkout', { plan: planKey, interval: annual ? 'year' : 'month', moment: variant });
    try {
      (window as Window & { fbq?: (...args: unknown[]) => void }).fbq?.('track', 'InitiateCheckout', {
        value: annual ? plan.annualTotal : plan.monthlyPrice,
        currency: 'USD',
        content_name: `${plan.name} ${annual ? 'Annual' : 'Monthly'}`,
        num_items: 1,
      });
    } catch {
      // The pixel may not have loaded; checkout goes ahead regardless.
    }
    try {
      const priceId = getPriceId(planKey, annual);
      if (!priceId) throw new Error('That plan is not available right now');
      await onBeforeCheckout?.();
      if (!(await createCheckoutSession(priceId, await user.getIdToken(), { cancelPath }))) setBusy(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start checkout');
      setBusy(false);
    }
  };

  const facts = before
    ? ready.map((text) => ({ icon: Check, text }))
    : [
    stats?.words ? { icon: FileText, text: `${stats.words.toLocaleString()} words` } : null,
    stats?.sections ? { icon: ListTree, text: `${stats.sections} sections` } : null,
    stats?.ownLinks ? { icon: Link2, text: `${stats.ownLinks} links to your own pages` } : null,
    { icon: Check, text: 'SEO title and meta description' },
  ].filter((fact): fact is { icon: typeof FileText; text: string } => Boolean(fact));

  return (
    <div className={`overflow-hidden rounded-2xl border border-blue-200 bg-white ${before ? '' : 'mb-4 shadow-lg shadow-blue-900/5'}`}>
      <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 px-5 py-5 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
          {before ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Everything&apos;s ready for your first article
            </>
          ) : (
            <>
              <PartyPopper className="h-3.5 w-3.5" /> Your first article is ready
            </>
          )}
        </p>
        <h3 className="mt-2 text-xl font-bold leading-tight sm:text-2xl">
          {before
            ? 'Write it complete, with a thumbnail that makes people click'
            : `That's one page Google can find you on. Imagine ${monthly(planKey)} more every month.`}
        </h3>
        {before && (
          <p className="mt-1.5 text-sm text-blue-50/90">
            We can write it now. Start a plan and it comes finished, with its featured image designed in your brand colour,
            then {monthly(planKey)} more like it every month.
          </p>
        )}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
              <Icon className="h-3.5 w-3.5" /> {text}
            </li>
          ))}
        </ul>
      </div>

      <div className={`grid gap-5 p-5 ${before ? 'md:grid-cols-[minmax(0,15rem)_1fr]' : 'lg:grid-cols-[minmax(0,17rem)_1fr]'}`}>
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-900">{before ? 'Your article’s thumbnail' : 'Finish it with a thumbnail'}</p>
          {preview}
          <p className="mt-2 text-xs text-gray-500">
            {before
              ? 'Made with your article, set as its featured image and sent to Shopify with it.'
              : 'Made the moment you upgrade, set as the featured image and sent to Shopify with the article.'}
          </p>
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <TrendingUp className="h-4 w-4 text-green-600" /> Rankings come from consistency
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Each article targets another search your customers make and links them to what you sell. Here&apos;s how many pages
            you could publish in a year:
          </p>
          <ul className="mt-3 space-y-2">
            {runway.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className={`font-medium ${row.key === planKey ? 'text-blue-700' : 'text-gray-600'}`}>{row.name}</span>
                  <span className="tabular-nums text-gray-500">
                    <strong className={row.key === planKey ? 'text-blue-700' : 'text-gray-800'}>{row.perYear.toLocaleString()}</strong> a year
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      row.key === planKey ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : row.key === 'free' ? 'bg-gray-300' : 'bg-blue-200'
                    }`}
                    style={{ width: `${Math.max(2, (row.perYear / maxYear) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            The same tool behind 3,000,000+ organic impressions for our clients.
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-gray-50/70 p-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
          {(['kickstart', 'seo_takeover'] as const).map((key) => {
            const option = PLANS.find((p) => p.key === key)!;
            const active = planKey === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setPlanKey(key);
                  track('tutorial_upgrade_plan_pick', { plan: key });
                }}
                className={`relative rounded-xl border bg-white p-3 text-left transition ${
                  active ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {option.badge && (
                  <span className="absolute -top-2 right-3 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {option.badge}
                  </span>
                )}
                <span className="block text-sm font-semibold text-gray-900">{option.name}</span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  {monthly(key)} articles a month, thumbnails included
                  {key === 'seo_takeover' ? ', 5 automations' : ', 1 automation'}
                </span>
                <span className="mt-1.5 block text-sm">
                  <strong className="text-gray-900">${annual ? option.annualMonthlyPrice : option.monthlyPrice}</strong>
                  <span className="text-gray-500">/mo</span>
                  {annual && <span className="ml-1.5 text-xs text-gray-400 line-through">${option.monthlyPrice}</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${annual ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Annual
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${annual ? 'bg-white/20' : 'bg-green-100 text-green-700'}`}>Save 20%</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAnnual(false);
                track('tutorial_upgrade_monthly_pick', { plan: planKey });
              }}
              aria-pressed={!annual}
              className={`rounded-full px-3 py-1.5 ${!annual ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Monthly
            </button>
          </div>
          <p className="text-xs text-gray-600">
            {annual ? (
              <>
                <strong className="text-gray-900">${plan.annualTotal}</strong> billed yearly.{' '}
                <span className="font-semibold text-green-700">You save ${saving} a year.</span>
              </>
            ) : (
              <>
                ${plan.monthlyPrice} billed monthly.{' '}
                <button type="button" onClick={() => setAnnual(true)} className="font-semibold text-green-700 hover:underline">
                  Save ${saving} with annual
                </button>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={checkout}
          disabled={busy}
          className="group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-60 sm:text-base"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {before ? `Start ${plan.name} at $${perMonth}/mo, write it with a thumbnail` : `Get ${plan.name} at $${perMonth}/mo and my thumbnail`}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-green-600" /> 7-day happiness guarantee
          </span>
          <span aria-hidden>·</span>
          <span>Cancel anytime</span>
          <span aria-hidden>·</span>
          <span>Secure checkout by Stripe</span>
        </p>
        {before ? (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              Skip, write my article for free
            </button>
            <p className="mt-1.5 text-center text-xs text-gray-500">The full article, without its thumbnail. Ready in 2 to 3 minutes.</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mx-auto mt-3 flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change the topic
              </button>
            )}
          </>
        ) : (
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <Link href="/pricing?from=tutorial-thumbnail" className="font-medium text-gray-500 hover:text-blue-600">
              Compare all plans
            </Link>
            <button type="button" onClick={onDismiss} className="font-medium text-gray-400 hover:text-gray-600">
              Not now, my article is saved
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
