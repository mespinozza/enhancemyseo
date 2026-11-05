'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { PLANS } from '@/lib/plans';
import { DONE_FOR_YOU, createCheckoutSession, getOriginalPrice, getPriceId } from '@/lib/stripe';
import { PLAN_COPY } from '@/lib/proof/content';
import DoneForYouOffer, { INCLUDED as DONE_FOR_YOU_INCLUDED } from '@/components/pricing/DoneForYouOffer';
import { useProofTrack, useSignupHref } from './ProofProvider';

type Fbq = (...args: unknown[]) => void;

export default function PlanCards({ recommended }: { recommended: 'kickstart' | 'seo_takeover' }) {
  const router = useRouter();
  const { user } = useAuth();
  const send = useProofTrack();
  const signupHref = useSignupHref();
  const [isAnnual, setIsAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDoneForYou, setShowDoneForYou] = useState(false);
  const offerRef = useRef<HTMLDivElement>(null);

  const choose = async (key: (typeof PLANS)[number]['key']) => {
    const plan = PLANS.find((p) => p.key === key)!;
    const value = isAnnual ? plan.annualTotal : plan.monthlyPrice;
    send('plan_select', {
      plan: plan.key,
      interval: plan.monthlyPrice === 0 ? undefined : isAnnual ? 'year' : 'month',
      value,
      currency: 'USD',
    });

    if (plan.monthlyPrice === 0) {
      router.push(signupHref);
      return;
    }

    try {
      (window as Window & { fbq?: Fbq }).fbq?.('track', 'InitiateCheckout', {
        value,
        currency: 'USD',
        content_name: `${plan.name} ${isAnnual ? 'Annual' : 'Monthly'}`,
        num_items: 1,
      });
    } catch {
      // Pixel not loaded: nothing to report.
    }

    const priceId = getPriceId(plan.key, isAnnual);
    if (!priceId) return;

    if (!user) {
      const params = new URLSearchParams({
        intent: 'purchase',
        priceId,
        tierName: plan.name,
        isAnnual: String(isAnnual),
      });
      router.push(`/login?${params.toString()}`);
      return;
    }

    setBusy(plan.key);
    try {
      await createCheckoutSession(priceId, await user.getIdToken());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      setBusy(null);
    }
  };

  const exploreDoneForYou = () => {
    send('plan_select', { plan: 'done_for_you', value: DONE_FOR_YOU.monthlyPrice, currency: 'USD' });
    setShowDoneForYou(true);
    // Wait a frame for the offer to mount before scrolling to it.
    requestAnimationFrame(() => offerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 p-1">
          {[false, true].map((annual) => (
            <button
              key={String(annual)}
              type="button"
              onClick={() => setIsAnnual(annual)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                isAnnual === annual ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {annual ? 'Annual' : 'Monthly'}
              {annual && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isAnnual ? 'bg-blue-500 text-white' : 'bg-green-100 text-green-700'
                  }`}
                >
                  Save 20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const copy = PLAN_COPY[plan.key];
          const featured = plan.key === recommended;
          const price = isAnnual ? plan.annualMonthlyPrice : plan.monthlyPrice;
          const original = getOriginalPrice(plan.key);

          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl bg-white p-6 transition-shadow ${
                featured
                  ? 'shadow-xl shadow-blue-600/15 ring-2 ring-blue-600'
                  : 'shadow-sm ring-1 ring-gray-200 hover:shadow-md'
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow">
                  Recommended
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-gray-600">{copy.audience}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight text-gray-900">${price}</span>
                <span className="text-sm text-gray-500">/month</span>
                {isAnnual && original > price && (
                  <span className="ml-1 text-sm text-gray-400 line-through">${original}</span>
                )}
              </div>
              <p className="mt-1 h-5 text-xs text-gray-500">
                {plan.monthlyPrice === 0
                  ? 'Free forever, no card needed'
                  : isAnnual
                    ? `Billed $${plan.annualTotal} yearly`
                    : 'Billed monthly, cancel anytime'}
              </p>

              <button
                type="button"
                onClick={() => choose(plan.key)}
                disabled={busy !== null}
                className={`mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-wait disabled:opacity-70 ${
                  featured
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/30 hover:-translate-y-0.5'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {busy === plan.key ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.cta}
              </button>

              <ul className="mt-6 space-y-2.5 text-sm">
                {plan.features.map((feature) => (
                  <li
                    key={feature.label}
                    className={`flex items-start gap-2 ${feature.included ? 'text-gray-700' : 'text-gray-400'}`}
                  >
                    {feature.included ? (
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" strokeWidth={2.5} />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" />
                    )}
                    {feature.label}
                  </li>
                ))}
              </ul>

              <div className="flex-1" />
              {copy.why && (
                <p className="mt-6 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">Why upgrade? </span>
                  {copy.why}
                </p>
              )}
            </div>
          );
        })}

        <div className="relative flex flex-col rounded-2xl bg-gray-950 p-6 text-white shadow-xl shadow-blue-900/20">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-300 ring-1 ring-inset ring-blue-400/30">
            <Sparkles className="h-3 w-3" />
            Managed
          </span>
          <h3 className="mt-3 text-lg font-bold">Done For You</h3>
          <p className="mt-1 text-sm text-gray-400">{PLAN_COPY.done_for_you.audience}</p>
          <div className="mt-5 flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tracking-tight">${DONE_FOR_YOU.monthlyPrice.toLocaleString()}</span>
            <span className="text-sm text-gray-400">/month</span>
          </div>
          <p className="mt-1 h-5 text-xs text-gray-500">Unlimited platform access included</p>

          <button
            type="button"
            onClick={exploreDoneForYou}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-blue-50"
          >
            {PLAN_COPY.done_for_you.cta}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </button>

          <ul className="mt-6 space-y-2.5 text-sm text-gray-300">
            {DONE_FOR_YOU_INCLUDED.map(({ title }) => (
              <li key={title} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400" strokeWidth={2.5} />
                {title}
              </li>
            ))}
          </ul>

          <div className="flex-1" />
          <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-gray-400">
            <span className="font-semibold text-white">Why go managed? </span>
            {PLAN_COPY.done_for_you.why}
          </p>
        </div>
      </div>

      {showDoneForYou && (
        <div ref={offerRef} className="mt-10 scroll-mt-24">
          <DoneForYouOffer />
        </div>
      )}
    </div>
  );
}
