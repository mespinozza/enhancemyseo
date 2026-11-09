'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getOnboarding, saveOnboarding, shouldOfferOnboarding } from '@/lib/onboarding/state';
import { track } from '@/lib/analytics';

const PREVIEW_STEPS = ['Add your website', 'Confirm your business', 'Pick a topic', 'Get your article'];

/** Offers the first-article tutorial to accounts that have not made anything yet. */
export default function WelcomeCard() {
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    shouldOfferOnboarding(user.uid)
      .then(async (offer) => {
        if (cancelled || !offer) return;
        const state = await getOnboarding(user.uid);
        if (cancelled) return;
        setResuming(state?.status === 'in_progress');
        setVisible(true);
        track('onboarding_offer_view', { resuming: state?.status === 'in_progress' });
      })
      .catch((error) => console.warn('Could not check tutorial state:', error));
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (!visible || !user) return null;

  const start = async () => {
    setBusy(true);
    track(resuming ? 'onboarding_resume' : 'onboarding_start');
    try {
      if (!resuming) await saveOnboarding(user.uid, { status: 'in_progress', step: 1, startedAtMs: Date.now() });
    } catch (error) {
      console.warn('Could not save tutorial state:', error);
    }
    router.push('/dashboard/welcome');
  };

  const skip = async () => {
    setVisible(false);
    track('onboarding_skip', { from: 'dashboard_card' });
    await saveOnboarding(user.uid, { status: 'skipped' }).catch(() => {});
  };

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-lg sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <button
        type="button"
        onClick={skip}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            {resuming ? 'Pick up where you left off' : 'New here? Start with this'}
          </span>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
            {resuming ? 'Finish your first article' : 'Generate your first article in the next few minutes'}
          </h2>
          <p className="mt-2 max-w-xl text-blue-100">
            Paste your website and we&apos;ll read it, set up your brand, and write an article that links to your
            real products and pages. Your first one is on us, and it doesn&apos;t count toward your monthly articles.
          </p>
          <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-blue-100">
            {PREVIEW_STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 shadow transition hover:bg-blue-50 disabled:opacity-70"
          >
            {resuming ? 'Continue the tutorial' : 'Show me how'}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={skip}
            className="rounded-xl border border-white/30 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            I already know how to use the tool
          </button>
          <span className="flex items-center justify-center gap-1.5 text-xs text-blue-200">
            <Clock className="h-3.5 w-3.5" /> About 3 minutes
          </span>
        </div>
      </div>
    </div>
  );
}
