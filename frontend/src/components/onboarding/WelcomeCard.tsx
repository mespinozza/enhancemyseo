'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowRight, Check, Clock, Loader2, Sparkles, TrendingUp, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { auth } from '@/lib/firebase/config';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import {
  dismissForThisSignIn,
  getOnboarding,
  isDismissedThisSignIn,
  isOnboardingPreview,
  saveOnboarding,
  shouldOfferOnboarding,
  type OnboardingState,
} from '@/lib/onboarding/state';
import { track } from '@/lib/analytics';
import type { AnalyzeResponse } from '@/app/api/onboarding/analyze/route';
import { TutorialReadyOffer } from '@/components/thumbnail/TutorialThumbnail';
import { THUMBNAIL_TIERS } from '@/lib/thumbnail/types';
import {
  clearPendingTutorialUpgrade,
  pendingTutorialUpgrade,
  savePendingTutorialUpgrade,
} from '@/lib/thumbnail/tutorial-pending';
import {
  STEPS,
  BusinessStep,
  ConnectStep,
  Progress,
  TopicStep,
  WebsiteStep,
  beginConnection,
  tutorialReturnTo,
  useConnections,
  type Authed,
  type BusinessDraft,
} from './TutorialSteps';

const REMAINING_STEPS = ['Add your website', 'Confirm your business', 'Pick a topic', 'Get your article'];

const HIDDEN_SCROLLBAR = 'overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Where a sign-in sent the user back to, read from `/dashboard?tutorial=N&shopify=...`. */
function readReturn() {
  const params = new URLSearchParams(window.location.search);
  const step = Number(params.get('tutorial'));
  if (!step) return null;
  return {
    step: step >= 1 && step <= STEPS.length ? step : 1,
    shopify: params.get('shopify'),
    gsc: params.get('gsc'),
    reason: params.get('reason'),
  };
}

/**
 * Offers the first-article tutorial to accounts that have not made anything yet, as a
 * modal over a dimmed dashboard, and runs its steps in place. Once there is a business
 * and a topic it hands over to the articles page, which writes the article. A click on
 * the backdrop does not close it, so skipping is always a deliberate choice.
 */
export default function WelcomeCard() {
  const { user } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<'hidden' | 'intro' | 'flow'>('hidden');
  const [resuming, setResuming] = useState(false);
  const [preview, setPreview] = useState(false);
  const [bonusAvailable, setBonusAvailable] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [returnInfo, setReturnInfo] = useState<ReturnType<typeof readReturn>>(null);
  const signInTime = auth.currentUser?.metadata.lastSignInTime;

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const returned = readReturn();
    (async () => {
      // Paid for in the tutorial, before the article was written: go and write it.
      if (new URLSearchParams(window.location.search).get('success') === 'true' && pendingTutorialUpgrade()) {
        router.replace('/dashboard/articles?tutorial=1');
        return;
      }
      // Back from a cancelled checkout: the offer is shown again, so nothing is pending.
      if (returned) clearPendingTutorialUpgrade();
      if (returned) {
        // Back from a sign-in partway through: reopen on the step it left from.
        if (cancelled) return;
        setReturnInfo(returned);
        setPreview(await isOnboardingPreview(user.uid).catch(() => false));
        setPhase('flow');
        return;
      }
      const offer = await shouldOfferOnboarding(user.uid);
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
      setPhase('intro');
      track('onboarding_offer_view', { resuming: state?.status === 'in_progress' });
    })().catch((error) => console.warn('Could not check tutorial state:', error));
    return () => {
      cancelled = true;
    };
    // Keyed on the uid: the user object is replaced on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, signInTime]);

  useEffect(() => {
    if (phase === 'hidden') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (phase === 'hidden' || !user) return null;

  const firstName = user.displayName?.trim().split(/\s+/)[0] || '';

  const start = () => {
    track(resuming ? 'onboarding_resume' : 'onboarding_start');
    setFresh(!resuming);
    setPhase('flow');
  };

  const remindLater = () => {
    setPhase('hidden');
    dismissForThisSignIn(user.uid, signInTime);
    track('onboarding_remind_later', { from: phase });
  };

  const skip = async (from: string) => {
    // Test accounts keep seeing it, so for them skipping only lasts until the next login.
    if (preview) return remindLater();
    setPhase('hidden');
    track('onboarding_skip', { from });
    await saveOnboarding(user.uid, { status: 'skipped', skippedAtMs: Date.now() }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
      <div aria-hidden className="absolute inset-0 animate-pick-fade bg-gray-950/70 backdrop-blur-sm" />

      {phase === 'flow' ? (
        <TutorialFlow
          fresh={fresh}
          preview={preview}
          returnInfo={returnInfo}
          onSkip={() => skip('tutorial')}
        />
      ) : (
        /* The card clips its glow; the inner panel scrolls, without a visible bar, only if
           a very short screen cannot fit it. */
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
            onClick={() => skip('dashboard_modal')}
            aria-label="Skip the tutorial"
            className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:right-4 sm:top-4"
          >
            <X className="h-5 w-5" />
          </button>

          <div className={`relative p-5 sm:p-8 [@media(max-height:720px)]:sm:p-6 ${HIDDEN_SCROLLBAR}`}>
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
                : 'Get a ready-to-publish article for your business in about 3 minutes'}
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
                The same <strong className="text-white">tool</strong> behind <strong className="text-white">3,000,000+ organic impressions</strong> for our clients.
              </span>
            </p>

            <div className="mt-5 sm:mt-6 [@media(max-height:720px)]:sm:mt-4">
              <button
                type="button"
                onClick={start}
                autoFocus
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-blue-700 shadow-lg transition-all duration-300 hover:bg-blue-50 hover:shadow-xl motion-safe:hover:-translate-y-0.5 sm:py-3.5"
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
              <button
                type="button"
                onClick={() => skip('dashboard_modal')}
                className="font-medium text-blue-100 underline-offset-4 hover:text-white hover:underline"
              >
                I already know how to use the tool
              </button>
              <button type="button" onClick={remindLater} className="underline-offset-4 hover:text-white hover:underline">
                Remind me next time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Steps one to four, inside the modal. */
function TutorialFlow({
  fresh,
  preview,
  returnInfo,
  onSkip,
}: {
  fresh: boolean;
  /** Test accounts see the free-account offer whatever their plan. */
  preview: boolean;
  returnInfo: ReturnType<typeof readReturn>;
  onSkip: () => void;
}) {
  const { user, subscription_status } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const [offer, setOffer] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const step = state?.step && state.step <= STEPS.length ? state.step : 1;
  const connections = useConnections(user as Authed, state?.brandId);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      let current = await getOnboarding(user.uid);
      if (fresh || !current || current.status !== 'in_progress') {
        current = { ...(current || {}), status: 'in_progress', step: 1, startedAtMs: Date.now(), connectVia: null };
        await saveOnboarding(user.uid, current);
      }
      if (returnInfo && current.brandId) current = { ...current, step: returnInfo.step };
      // The scan result is not stored, so without a saved brand there is nothing to resume past step one.
      if (!current.brandId || (current.step ?? 1) > STEPS.length) current = { ...current, step: current.brandId ? STEPS.length : 1 };
      if (current.brandId) {
        const brands = await brandProfileOperations.getAll(user.uid);
        const found = brands.find((b) => b.id === current!.brandId) || null;
        if (!cancelled) setBrand(found);
        if (!found) current = { ...current, brandId: undefined, step: 1 };
      }
      if (!cancelled) setState(current);
    })().catch((error) => {
      console.error('Could not load the tutorial:', error);
      if (!cancelled) setState({ status: 'in_progress', step: 1 });
    });
    return () => {
      cancelled = true;
    };
    // Loaded once when the flow opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!returnInfo || (!returnInfo.shopify && !returnInfo.gsc)) return;
    const { shopify, gsc, reason } = returnInfo;
    if (shopify === 'connected') toast.success('Shopify connected');
    if (gsc === 'connected') toast.success('Search Console connected');
    if (shopify === 'error' || gsc === 'error') toast.error(reason || 'That connection did not finish. You can try again.');
    track(shopify ? 'onboarding_connect_shopify' : 'onboarding_connect_gsc', { result: shopify || gsc });
  }, [returnInfo]);

  useEffect(() => {
    // The sign-in return parameters have done their job; a refresh should not replay them.
    if (returnInfo) router.replace('/dashboard', { scroll: false });
  }, [returnInfo, router]);

  const update = useCallback(
    (patch: Partial<OnboardingState>) => {
      if (!user) return;
      setState((prev) => ({ ...(prev as OnboardingState), ...patch }));
      saveOnboarding(user.uid, patch).catch((error) => console.warn('Could not save tutorial progress:', error));
      if (patch.step) panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [user]
  );

  if (!user) return null;
  const authed = user as Authed;

  const saveBusiness = async (draft: BusinessDraft) => {
    setSaving(true);
    try {
      const fields: Partial<BrandProfile> = {
        brandName: draft.brandName.trim(),
        businessType: draft.businessType.trim(),
        brandGuidelines: draft.description.trim(),
        toneOfVoice: draft.tone.trim(),
        ...(analysis?.websiteUrl && { websiteUrl: analysis.websiteUrl }),
        ...(analysis?.shopDomain && { shopifyStoreUrl: analysis.shopDomain }),
      };
      let brandId = state?.brandId;
      if (brandId) {
        await brandProfileOperations.update(user.uid, brandId, fields);
      } else {
        brandId = await brandProfileOperations.create(user.uid, {
          userId: user.uid,
          citeSources: true,
          ...fields,
        } as Omit<BrandProfile, 'id'>);
      }
      setBrand((prev) => ({ ...(prev || ({} as BrandProfile)), ...fields, id: brandId, userId: user.uid }) as BrandProfile);
      track('onboarding_step_complete', { step: 2, step_name: 'Business' });
      update({
        step: 3,
        brandId,
        ...(analysis && {
          websiteUrl: analysis.websiteUrl,
          isShopify: analysis.isShopify,
          shopDomain: analysis.shopDomain,
          kind: analysis.business.kind,
          topics: analysis.topics,
        }),
      });
    } catch (error) {
      console.error('Could not save the brand profile:', error);
      toast.error('Could not save your business details. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Connections hang off a brand profile, so connecting before the business step needs a
   * placeholder one. The scan on return fills it in, and step two lets the user correct it.
   */
  const connectFirst = async (provider: 'shopify' | 'gsc', shopDomain = '') => {
    track('onboarding_connect_start', { provider, from_step: 1 });
    let brandId = state?.brandId;
    if (!brandId) {
      const placeholder = provider === 'shopify' ? shopDomain.trim().split('.')[0] || 'My store' : 'My business';
      brandId = await brandProfileOperations.create(user.uid, {
        userId: user.uid,
        brandName: placeholder,
        businessType: '',
        citeSources: true,
      } as Omit<BrandProfile, 'id'>);
      // Saved before connecting, so a failed attempt is retried on this profile, not a new one.
      const created = brandId;
      setState((prev) => ({ ...(prev as OnboardingState), brandId: created }));
      await saveOnboarding(user.uid, { brandId: created });
    }
    const target = await beginConnection(authed, provider, brandId, tutorialReturnTo(1), shopDomain);
    // Awaited, unlike other progress saves: the page is about to unload.
    await saveOnboarding(user.uid, { brandId, step: 1, connectVia: provider });
    window.location.assign(target);
  };

  const topicChosen = (keyword: string, source: string) => {
    track('onboarding_topic_selected', { source });
    track('onboarding_step_complete', { step: 4, step_name: 'Topic' });
  };

  const handOff = async (keyword: string) => {
    setHandingOff(true);
    clearPendingTutorialUpgrade();
    // Awaited: the articles page reads this to fill in its form.
    await saveOnboarding(user.uid, { step: 5, keyword }).catch((error) => console.warn('Could not save the topic:', error));
    router.push('/dashboard/articles?tutorial=1');
  };

  // Free accounts stop here before writing, to be offered the article with its thumbnail.
  const offerUpgrade = preview || !THUMBNAIL_TIERS.includes(subscription_status || 'free');

  const chooseTopic = (keyword: string, source: string) => {
    topicChosen(keyword, source);
    if (offerUpgrade) {
      update({ keyword });
      setOffer(keyword);
    } else {
      handOff(keyword);
    }
  };

  const websiteHost = (state?.shopDomain || state?.websiteUrl || brand?.websiteUrl || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
  const ready = [
    brand?.brandName && `Business: ${brand.brandName}`,
    websiteHost && `${connections.shopify ? 'Store' : 'Website'}: ${websiteHost}`,
    brand?.toneOfVoice && brand.toneOfVoice.length <= 30 && `Voice: ${brand.toneOfVoice}`,
    offer && `Topic: ${offer}`,
  ].filter((item): item is string => Boolean(item));

  let content: React.ReactNode = null;
  if (state) {
    switch (step) {
      case 1:
        content = (
          <WebsiteStep
            user={authed}
            state={state}
            brand={brand}
            connections={connections}
            onConnect={connectFirst}
            onDone={(result) => {
              setAnalysis(result);
              track('onboarding_step_complete', { step: 1, step_name: 'Website', source: result.source });
              update({ step: 2, connectVia: null });
            }}
          />
        );
        break;
      case 2:
        content = <BusinessStep analysis={analysis} brand={brand} saving={saving} onBack={() => update({ step: 1 })} onSave={saveBusiness} />;
        break;
      case 3:
        content = (
          <ConnectStep
            user={authed}
            state={state}
            connections={connections}
            onBack={() => update({ step: 2 })}
            onNext={() => {
              track('onboarding_step_complete', { step: 3, step_name: 'Connect' });
              update({ step: 4 });
            }}
          />
        );
        break;
      default:
        content = offer ? (
          <TutorialReadyOffer
            keyword={offer}
            brandName={brand?.brandName}
            brandColor={brand?.brandColor}
            ready={ready}
            onSkip={() => handOff(offer)}
            onBack={() => setOffer(null)}
            onBeforeCheckout={async (layout) => {
              savePendingTutorialUpgrade(offer, layout);
              await saveOnboarding(user.uid, { step: 5, keyword: offer });
            }}
            cancelPath={`/dashboard?tutorial=${STEPS.length}`}
          />
        ) : (
          <TopicStep user={authed} state={state} gscConnected={connections.gsc} onBack={() => update({ step: 3 })} onNext={chooseTopic} />
        );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set up your first article"
      className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl animate-pick-fade flex-col overflow-hidden rounded-3xl bg-white shadow-2xl shadow-blue-950/40 ring-1 ring-black/5 sm:max-h-[calc(100dvh-3rem)]"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3 sm:px-8 sm:py-4">
        <div className="min-w-0 flex-1">{state && <Progress step={step} />}</div>
        <button type="button" onClick={onSkip} className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-800 sm:text-sm">
          Skip tutorial
        </button>
      </div>

      <div ref={panelRef} className={`relative flex-1 p-5 sm:p-8 [@media(max-height:720px)]:sm:p-6 ${HIDDEN_SCROLLBAR}`}>
        {!state || handingOff ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            {handingOff && <p className="text-sm text-gray-600">Setting up your article…</p>}
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
