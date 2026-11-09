'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Clock, Sparkles, TrendingUp, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { auth } from '@/lib/firebase/config';
import {
  dismissForThisSignIn,
  getOnboarding,
  isDismissedThisSignIn,
  isOnboardingPreview,
  saveOnboarding,
  shouldOfferOnboarding,
} from '@/lib/onboarding/state';
import { track } from '@/lib/analytics';

const REMAINING_STEPS = ['Add your website', 'Confirm your business', 'Pick a topic', 'Get your article'];

/**
 * Offers the first-article tutorial to accounts that have not made anything yet, as a
 * modal over a dimmed dashboard. A click on the backdrop does not close it, so skipping
 * is always a deliberate choice.
 */
export default function WelcomeCard() {
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [bonusAvailable, setBonusAvailable] = useState(false);
  const signInTime = auth.currentUser?.metadata.lastSignInTime;

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    shouldOfferOnboarding(user.uid)
      .then(async (offer) => {
        if (cancelled || !offer || isDismissedThisSignIn(user.uid, signInTime)) return;
        const [state, isPreview, bonus] = await Promise.all([
          getOnboarding(user.uid),
          isOnboardingPreview(user.uid),
          user
            .getIdToken()
            .then((token) => fetch('/api/onboarding/bonus', { headers: { Authorization: `Bearer ${token}` } }))
            .then((r) => (r.ok ? r.json() : { available: false }))
            .catch(() => ({ available: false })),
        ]);
        if (cancelled) return;
        setPreview(isPreview);
        setBonusAvailable(Boolean(bonus.available));
        // A preview always starts over, so the card offers a fresh run rather than a resume.
        setResuming(!isPreview && state?.status === 'in_progress');
        setVisible(true);
        track('onboarding_offer_view', { resuming: state?.status === 'in_progress' });
      })
      .catch((error) => console.warn('Could not check tutorial state:', error));
    return () => {
      cancelled = true;
    };
    // Keyed on the uid: the user object is replaced on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, signInTime]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  if (!visible || !user) return null;

  const firstName = user.displayName?.trim().split(/\s+/)[0] || '';

  const start = async () => {
    setBusy(true);
    track(resuming ? 'onboarding_resume' : 'onboarding_start');
    try {
      if (!resuming) await saveOnboarding(user.uid, { status: 'in_progress', step: 1, startedAtMs: Date.now(), connectVia: null });
    } catch (error) {
      console.warn('Could not save tutorial state:', error);
    }
    router.push('/dashboard/welcome');
  };

  const remindLater = () => {
    setVisible(false);
    dismissForThisSignIn(user.uid, signInTime);
    track('onboarding_remind_later');
  };

  const skip = async () => {
    // Test accounts keep seeing it, so for them skipping only lasts until the next login.
    if (preview) return remindLater();
    setVisible(false);
    track('onboarding_skip', { from: 'dashboard_modal' });
    await saveOnboarding(user.uid, { status: 'skipped' }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
      <div aria-hidden className="absolute inset-0 animate-pick-fade bg-gray-950/70 backdrop-blur-sm" />

      {/* The card clips its glow; the inner panel scrolls, without a visible bar, only if a
          very short screen cannot fit it. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl animate-pick-fade flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-950/50 ring-1 ring-white/10 sm:max-h-[calc(100dvh-3rem)]"
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />

        <button
          type="button"
          onClick={skip}
          aria-label="Skip the tutorial"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:right-4 sm:top-4"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative overflow-y-auto overflow-x-hidden overscroll-contain p-5 [scrollbar-width:none] sm:p-8 [&::-webkit-scrollbar]:hidden [@media(max-height:720px)]:sm:p-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            {firstName ? `Welcome, ${firstName}` : 'Welcome to EnhanceMySEO'}
          </span>
          <h2
            id="welcome-title"
            className="mt-3 pr-6 text-xl font-bold leading-tight sm:mt-4 sm:text-3xl [@media(max-height:720px)]:sm:text-2xl"
          >
            {resuming
              ? 'Your first article is a few clicks away'
              : 'See a ready-to-publish article for your business in about 3 minutes'}
          </h2>
          <p className="mt-2 text-sm text-blue-100 sm:mt-3 sm:text-base [@media(max-height:720px)]:sm:text-sm">
            {resuming
              ? 'You’re partway there. Pick up where you left off and we’ll write it for you now.'
              : `Just enter your website. We’ll learn what you sell and write an SEO article that links to your own product or service pages.${
                  bonusAvailable ? ' Your first one is free and doesn’t use your monthly articles.' : ''
                }`}
          </p>

          {/* Account creation is genuinely done, and a card that starts part-filled gets finished more often. */}
          <div className="mt-4 sm:mt-6 [@media(max-height:720px)]:sm:mt-4">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 text-white">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-400 text-green-950">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                Account created
              </span>
              <span className="text-blue-200">1 of 5 done</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-1/5 rounded-full bg-green-400" />
            </div>
          </div>

          <ol className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5">
            {REMAINING_STEPS.map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-xs sm:gap-3 sm:px-3 sm:py-2.5 sm:text-sm"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-blue-700 sm:h-6 sm:w-6 sm:text-xs">
                  {index + 2}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-4 flex items-start gap-2 text-xs text-blue-100 sm:text-sm">
            <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-300" />
            <span>
              The same writer behind <strong className="text-white">3,000,000+ organic impressions</strong> for our clients.
            </span>
          </p>

          <div className="mt-5 sm:mt-6 [@media(max-height:720px)]:sm:mt-4">
            <button
              type="button"
              onClick={start}
              disabled={busy}
              autoFocus
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 shadow-lg transition-all duration-300 hover:bg-blue-50 hover:shadow-xl motion-safe:hover:-translate-y-0.5 disabled:opacity-70 sm:py-3.5"
            >
              {resuming ? 'Finish my first article' : bonusAvailable ? 'Write my first article, free' : 'Write my first article'}
              <ArrowRight className="h-4 w-4 transition-transform duration-300 motion-safe:group-hover:translate-x-1" />
            </button>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-blue-200">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> About 3 minutes
              </span>
              <span aria-hidden>·</span>
              <span>No credit card</span>
              <span aria-hidden>·</span>
              <span>Nothing on your site changes</span>
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-blue-200 sm:text-sm">
            <button type="button" onClick={skip} className="font-medium text-blue-100 underline-offset-4 hover:text-white hover:underline">
              I already know how to use the tool
            </button>
            <button type="button" onClick={remindLater} className="underline-offset-4 hover:text-white hover:underline">
              Remind me next time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
