'use client';

/**
 * Steps one to four of the first-article tutorial, shown inside the dashboard's welcome
 * modal. The article itself is generated on the articles page, with these answers filled in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Globe,
  Loader2,
  ShoppingBag,
  Store,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import type { OnboardingState } from '@/lib/onboarding/state';
import { track } from '@/lib/analytics';
import type { AnalyzeResponse, TopicSuggestion } from '@/app/api/onboarding/analyze/route';
import TonePicker from '@/components/TonePicker';
import KeywordIdeaButton from '@/components/keywords/KeywordIdeaButton';
import { closestToneLabel } from '@/lib/article/enhanced/tones';

export const STEPS = ['Website', 'Business', 'Connect', 'Topic'] as const;
/** Where a provider sign-in lands; the dashboard reopens the tutorial at that step. */
export const tutorialReturnTo = (step: number) => `/dashboard?tutorial=${step}`;

export type Authed = NonNullable<ReturnType<typeof useAuth>['user']>;

export async function authedFetch(user: Authed, url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init.headers || {}),
    },
  });
}

function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* ────────────────────────────────── Shared pieces ────────────────────────────────── */

export function Progress({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Tutorial progress">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < step;
        const current = number === step;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1.5 rounded-full transition-colors duration-500 ${
                done ? 'bg-blue-600' : current ? 'bg-blue-400' : 'bg-gray-200'
              }`}
            />
            <span
              className={`hidden text-xs font-medium sm:block ${
                current ? 'text-blue-700' : done ? 'text-gray-700' : 'text-gray-400'
              }`}
              aria-current={current ? 'step' : undefined}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
      {body && <p className="mt-2 text-gray-600">{body}</p>}
    </div>
  );
}

function PrimaryButton({
  children,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${props.className || ''}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

/** Ticks through what the server is doing; the request itself gives no progress. */
function TimedChecklist({ items, intervals }: { items: string[]; intervals: number[] }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);
  const active = intervals.filter((at) => elapsed >= at).length - 1;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <li key={item} className={`flex items-center gap-3 text-sm ${index > active ? 'text-gray-400' : 'text-gray-800'}`}>
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                done ? 'bg-green-100 text-green-600' : current ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            </span>
            {item}
          </li>
        );
      })}
    </ul>
  );
}

/* ──────────────────────────────────── Step 1 ──────────────────────────────────── */

/**
 * The box shows /sitemap.xml as a fixed suffix, so only the domain is typed. A pasted
 * product URL is cut back to its domain, and a custom sitemap file is kept as given.
 */
function toSitemapUrl(input: string): string {
  const value = input.trim().replace(/\/+$/, '');
  if (/\.xml(\.gz)?$/i.test(value)) return value;
  const scheme = /^http:\/\//i.test(value) ? 'http://' : '';
  const host = value.replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
  return `${scheme}${host}/sitemap.xml`;
}

export function WebsiteStep({
  user,
  state,
  brand,
  connections,
  onConnect,
  onDone,
}: {
  user: Authed;
  state: OnboardingState;
  brand: BrandProfile | null;
  connections: Connections;
  onConnect: (provider: 'shopify' | 'gsc', shopDomain?: string) => Promise<void>;
  onDone: (analysis: AnalyzeResponse) => void;
}) {
  const [mode, setMode] = useState<'url' | 'manual'>('url');
  const [url, setUrl] = useState('');
  const [manual, setManual] = useState({ brandName: '', description: '', kind: 'ecommerce' as 'ecommerce' | 'service' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState('');
  const [connecting, setConnecting] = useState<'shopify' | 'gsc' | null>(null);
  const autoScannedRef = useRef(false);

  const submit = async (event?: React.FormEvent, siteOverride?: string) => {
    event?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await authedFetch(user, '/api/onboarding/analyze', {
        method: 'POST',
        body: JSON.stringify(siteOverride || mode === 'url' ? { url: toSitemapUrl(siteOverride || url) } : { manual }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'We could not read that website.');
      track('onboarding_scan_success', {
        source: data.source,
        shopify: Boolean(data.isShopify),
        has_sitemap: Boolean(data.sitemapUrl),
        products: data.counts?.product ?? 0,
      });
      onDone(data as AnalyzeResponse);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.';
      setError(message);
      track('onboarding_scan_fail', { source: mode, reason: message.slice(0, 90) });
    } finally {
      setBusy(false);
    }
  };

  // Back from connecting an account on this step: read the site that account belongs to.
  useEffect(() => {
    const via = state.connectVia;
    if (!via || autoScannedRef.current || !connections.loaded || !state.brandId) return;
    autoScannedRef.current = true;
    (async () => {
      let site = '';
      if (via === 'shopify' && connections.shopify) site = brand?.shopifyStoreUrl || '';
      if (via === 'gsc' && connections.gsc) {
        const status = await authedFetch(user, `/api/gsc/status?brandId=${state.brandId}`).then((r) => r.json());
        const property = (status.sites as { siteUrl: string }[] | undefined)?.[0]?.siteUrl;
        if (property) site = siteFromGscProperty(property);
      }
      if (!site) {
        setError(
          via === 'gsc' && connections.gsc
            ? 'Search Console is connected, but it has no websites on that Google account. Enter your website instead.'
            : 'That account did not finish connecting. Enter your website, or try again.'
        );
        return;
      }
      setUrl(site);
      await submit(undefined, site);
    })().catch(() => setError('We could not read your account. Enter your website instead.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connectVia, state.brandId, connections.loaded, connections.shopify, connections.gsc, brand?.shopifyStoreUrl]);

  const connect = async (provider: 'shopify' | 'gsc') => {
    setConnecting(provider);
    setError('');
    try {
      await onConnect(provider, shopDomain);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the connection.');
      setConnecting(null);
    }
  };

  if (busy) {
    return (
      <div>
        <StepHeader
          eyebrow="Step 1 of 4"
          title={mode === 'url' ? `Reading ${hostOf(url.startsWith('http') ? url : `https://${url}`)}` : 'Setting up your business'}
          body="This takes about 15 seconds."
        />
        <TimedChecklist
          items={
            mode === 'url'
              ? ['Reading your homepage', 'Finding your sitemap', 'Counting your product or service pages', 'Drafting your brand profile and topics']
              : ['Reading your description', 'Drafting your brand profile', 'Finding topics your customers search for']
          }
          intervals={mode === 'url' ? [0, 2, 5, 9] : [0, 2, 6]}
        />
      </div>
    );
  }

  return (
    <div>
      {mode === 'url' ? (
        <form onSubmit={submit}>
          <StepHeader
            eyebrow="Step 1 of 4"
            title="Where can we find your business?"
            body="Enter your website and we'll learn what you sell and which pages to link to. Takes about 15 seconds, and nothing on your site changes."
          />
          <label htmlFor="site" className="mb-2 block text-sm font-medium text-gray-700">
            Website address
          </label>
          <div className="flex items-center overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
            <Globe className="ml-4 h-5 w-5 flex-shrink-0 text-gray-400" />
            <input
              id="site"
              autoFocus
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(event) => setUrl(event.target.value.replace(/\/sitemap\.xml\/?$/i, ''))}
              placeholder="yourstore.com"
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-gray-900 focus:outline-none"
            />
            <span className="flex-shrink-0 self-stretch border-l border-gray-200 bg-gray-50 px-4 py-3 text-gray-500">
              /sitemap.xml
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Tip: just enter your website. It&apos;s the quickest way for us to find and link to your most important product
            or service pages.
          </p>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" disabled={url.trim().length < 4}>
              Scan my website <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setError('');
              }}
              className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-blue-600 hover:underline"
            >
              I don&apos;t have a website yet
            </button>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-6">
            <p className="text-sm font-medium text-gray-700">Or connect an account and we&apos;ll find your site from it</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setShopifyOpen((open) => !open)}
                aria-expanded={shopifyOpen}
                disabled={connecting !== null}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition disabled:opacity-60 ${
                  shopifyOpen ? 'border-[#5E8E3E] bg-[#95BF47]/10 text-[#3f6a26]' : 'border-gray-300 text-gray-800 hover:border-gray-400'
                }`}
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#95BF47]/15 text-[#5E8E3E]">
                  <ShoppingBag className="h-4 w-4" />
                </span>
                Connect Shopify store
              </button>
              <button
                type="button"
                onClick={() => connect('gsc')}
                disabled={connecting !== null}
                className="flex items-center gap-3 rounded-xl border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-800 transition hover:border-gray-400 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {connecting === 'gsc' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                </span>
                Connect Google Search Console
              </button>
            </div>

            {shopifyOpen && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <label htmlFor="shop" className="mb-2 block text-sm font-medium text-gray-700">
                  Your Shopify store address
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="shop"
                    autoFocus
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    className={`${inputClass} py-2 text-sm`}
                  />
                  <button
                    type="button"
                    onClick={() => connect('shopify')}
                    disabled={!shopDomain.trim() || connecting !== null}
                    className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5E8E3E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4f7a33] disabled:opacity-50"
                  >
                    {connecting === 'shopify' && <Loader2 className="h-4 w-4 animate-spin" />}
                    Connect
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Find it in your Shopify admin under Settings → Domains. It ends in .myshopify.com.
                </p>
              </div>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submit}>
          <StepHeader
            eyebrow="Step 1 of 4"
            title="Tell us about your business"
            body="Three quick answers and we'll draft the rest. You can add a website any time later."
          />
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-700">Business name</label>
              <input
                id="name"
                autoFocus
                value={manual.brandName}
                onChange={(event) => setManual({ ...manual, brandName: event.target.value })}
                className={inputClass}
                placeholder="Acme Outdoor Co."
              />
            </div>
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">What kind of business is it?</span>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'ecommerce', label: 'I sell products', icon: ShoppingBag },
                  { value: 'service', label: 'I offer a service', icon: Store },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setManual({ ...manual, kind: option.value })}
                    aria-pressed={manual.kind === option.value}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                      manual.kind === option.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <option.icon className="h-4 w-4" /> {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="desc" className="mb-2 block text-sm font-medium text-gray-700">
                What do you sell or do, and who for?
              </label>
              <textarea
                id="desc"
                rows={3}
                value={manual.description}
                onChange={(event) => setManual({ ...manual, description: event.target.value })}
                className={inputClass}
                placeholder="Waterproof hiking backpacks and trail gear for weekend hikers in the Pacific Northwest."
              />
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" disabled={!manual.brandName.trim() || manual.description.trim().length < 10}>
              Continue <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setMode('url');
                setError('');
              }}
              className="text-sm font-medium text-gray-600 underline-offset-4 hover:text-blue-600 hover:underline"
            >
              I have a website after all
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ──────────────────────────────────── Step 2 ──────────────────────────────────── */

export interface BusinessDraft {
  brandName: string;
  businessType: string;
  description: string;
  tone: string;
}

export function draftFromBrand(brand: BrandProfile): BusinessDraft {
  // Profiles saved before the tone dropdown kept it as a line in the guidelines.
  const [description, toneLine] = (brand.brandGuidelines || '').split(/\n\nTone of voice: /);
  return {
    brandName: brand.brandName,
    businessType: brand.businessType,
    description: description || '',
    tone: brand.toneOfVoice ?? closestToneLabel(toneLine),
  };
}

export function BusinessStep({
  analysis,
  brand,
  saving,
  onBack,
  onSave,
}: {
  analysis: AnalyzeResponse | null;
  brand: BrandProfile | null;
  saving: boolean;
  onBack: () => void;
  onSave: (draft: BusinessDraft) => void;
}) {
  const [draft, setDraft] = useState<BusinessDraft>(() =>
    analysis
      ? {
          brandName: analysis.business.brandName,
          businessType: analysis.business.businessType,
          description: analysis.business.description,
          tone: closestToneLabel(analysis.business.tone),
        }
      : brand
        ? draftFromBrand(brand)
        : { brandName: '', businessType: '', description: '', tone: '' }
  );
  const counts = analysis?.counts;
  const plus = analysis?.countsPartial ? '+' : '';
  const found = counts
    ? [
        counts.product && `${counts.product.toLocaleString()}${plus} products`,
        counts.collection && `${counts.collection.toLocaleString()}${plus} collections`,
        counts.page && `${counts.page.toLocaleString()}${plus} pages`,
        counts.blog && `${counts.blog.toLocaleString()}${plus} blog posts`,
      ].filter(Boolean)
    : [];

  return (
    <div>
      <StepHeader
        eyebrow="Step 2 of 4"
        title={analysis?.source === 'website' ? 'Here’s what we found' : 'Check your business details'}
        body="Every article is written from this. Fix anything that's off, or continue if it looks good. You can change it later."
      />

      {analysis?.source === 'website' && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <CheckCircle2 className="h-4 w-4" /> Connected to {hostOf(analysis.websiteUrl)}
            {analysis.isShopify && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                Shopify store
              </span>
            )}
          </p>
          {found.length > 0 ? (
            <p className="mt-1 text-sm text-green-700">
              Your sitemap lists {found.join(', ')}. Your articles will link to the ones that fit each topic.
            </p>
          ) : null}
          {analysis.warning && <p className="mt-1 text-sm text-amber-700">{analysis.warning}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="brandName" className="mb-2 block text-sm font-medium text-gray-700">Business name</label>
          <input id="brandName" value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="type" className="mb-2 block text-sm font-medium text-gray-700">Type of business</label>
          <input
            id="type"
            value={draft.businessType}
            onChange={(e) => setDraft({ ...draft, businessType: e.target.value })}
            className={inputClass}
            placeholder="Online store selling waterproof outdoor gear"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="about" className="mb-2 block text-sm font-medium text-gray-700">What you sell and who for</label>
          <textarea id="about" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tone" className="mb-2 block text-sm font-medium text-gray-700">Tone of voice</label>
          <TonePicker id="tone" value={draft.tone} onChange={(tone) => setDraft({ ...draft, tone })} />
          <p className="mt-1.5 text-xs text-gray-500">
            {analysis?.source === 'website' ? 'Picked from how your site reads. ' : ''}The same voices you can choose for every article.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        <PrimaryButton
          loading={saving}
          disabled={!draft.brandName.trim() || !draft.businessType.trim()}
          onClick={() => onSave(draft)}
        >
          Looks good, continue <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ──────────────────────────────────── Step 3 ──────────────────────────────────── */

export interface Connections {
  shopify: boolean;
  gsc: boolean;
  loaded: boolean;
}

/** Returns the provider's sign-in URL; the provider sends the user back to `returnTo`. */
export async function beginConnection(
  user: Authed,
  provider: 'shopify' | 'gsc',
  brandId: string,
  returnTo: string,
  shopDomain = ''
): Promise<string> {
  const response = await authedFetch(user, `/api/${provider}/connect`, {
    method: 'POST',
    body: JSON.stringify({ brandId, returnTo, ...(provider === 'shopify' && { shopDomain: shopDomain.trim() }) }),
  });
  const data = await response.json();
  if (!response.ok || !data.url) throw new Error(data.error || 'Could not start the connection.');
  if (provider === 'shopify') {
    await brandProfileOperations.update(user.uid, brandId, { shopifyStoreUrl: shopDomain.trim() }).catch(() => {});
  }
  return data.url;
}

/** Search Console names properties `sc-domain:example.com` or by URL; both reduce to a site. */
function siteFromGscProperty(property: string): string {
  return property.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function useConnections(user: Authed, brandId: string | undefined) {
  const [connections, setConnections] = useState<Connections>({ shopify: false, gsc: false, loaded: false });
  const refresh = useCallback(async () => {
    if (!brandId) return;
    const [shopify, gsc] = await Promise.all([
      authedFetch(user, `/api/shopify/status?brandId=${brandId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authedFetch(user, `/api/gsc/status?brandId=${brandId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setConnections({ shopify: Boolean(shopify?.connected), gsc: Boolean(gsc?.connected), loaded: true });
  }, [user, brandId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return connections;
}

export function ConnectStep({
  user,
  state,
  connections,
  onBack,
  onNext,
}: {
  user: Authed;
  state: OnboardingState;
  connections: Connections;
  onBack: () => void;
  onNext: () => void;
}) {
  const [shopDomain, setShopDomain] = useState(state.shopDomain || '');
  const [pending, setPending] = useState<'shopify' | 'gsc' | null>(null);
  const showShopifyFirst = state.isShopify || state.kind !== 'service';

  const start = async (provider: 'shopify' | 'gsc') => {
    if (!state.brandId) return;
    setPending(provider);
    track('onboarding_connect_start', { provider, from_step: 3 });
    try {
      window.location.assign(await beginConnection(user, provider, state.brandId, tutorialReturnTo(3), shopDomain));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not start the connection.');
      setPending(null);
    }
  };

  const shopifyCard = (
    <div key="shopify" className={`rounded-xl border p-5 ${connections.shopify ? 'border-green-200 bg-green-50/60' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#95BF47]/15 text-[#5E8E3E]">
          <ShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
            Shopify store
            {state.isShopify && !connections.shopify && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Recommended for you</span>
            )}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Articles pull in your real products with prices and images, and publish straight to your blog.
          </p>
          {connections.shopify ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Connected
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store.myshopify.com"
                className={`${inputClass} py-2 text-sm`}
                aria-label="Shopify store address"
              />
              <button
                type="button"
                onClick={() => start('shopify')}
                disabled={!shopDomain.trim() || pending !== null}
                className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5E8E3E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4f7a33] disabled:opacity-50"
              >
                {pending === 'shopify' && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect Shopify
              </button>
            </div>
          )}
          {!connections.shopify && (
            <p className="mt-2 text-xs text-gray-500">
              Use the my-store.myshopify.com address from your Shopify admin, not your custom domain.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const gscCard = (
    <div key="gsc" className={`rounded-xl border p-5 ${connections.gsc ? 'border-green-200 bg-green-50/60' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">Google Search Console</p>
          <p className="mt-1 text-sm text-gray-600">
            We&apos;ll suggest topics Google already shows you for but you don&apos;t rank well on yet. These are your quickest wins.
          </p>
          {connections.gsc ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Connected
            </p>
          ) : (
            <button
              type="button"
              onClick={() => start('gsc')}
              disabled={pending !== null}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {pending === 'gsc' && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect with Google
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const anyConnected = connections.shopify || connections.gsc;

  return (
    <div>
      <StepHeader
        eyebrow="Step 3 of 4 · Optional"
        title="Want an even better first article?"
        body="Optional. Each takes about 20 seconds and brings you right back here. Your website is already enough to write a great one."
      />
      <div className="space-y-4">{showShopifyFirst ? [shopifyCard, gscCard] : [gscCard, shopifyCard]}</div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={onNext}>
          {anyConnected ? 'Continue to my topic' : 'Skip, pick my topic'} <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ──────────────────────────────────── Step 4 ──────────────────────────────────── */

interface QuickWin {
  keyword: string;
  impressions: number;
  position: number;
}

function useQuickWins(user: Authed, brandId: string | undefined, websiteUrl: string | null | undefined, enabled: boolean) {
  const [wins, setWins] = useState<QuickWin[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !brandId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const status = await authedFetch(user, `/api/gsc/status?brandId=${brandId}`).then((r) => r.json());
      const sites: { siteUrl: string }[] = status.sites || [];
      const host = hostOf(websiteUrl);
      const site = sites.find((s) => host && s.siteUrl.includes(host)) || sites[0];
      if (!site) return;
      const preview = await authedFetch(user, '/api/gsc/preview', {
        method: 'POST',
        body: JSON.stringify({ brandId, siteUrl: site.siteUrl, dimension: 'query', metric: 'impressions', lookbackDays: 90, minMetric: 10 }),
      }).then((r) => r.json());
      const candidates: { keyword: string; impressions: number; position: number; covered: boolean }[] = preview.candidates || [];
      // Page two and lower half of page one: Google already trusts the site for these.
      const picked = candidates
        .filter((c) => !c.covered && c.position >= 4 && c.position <= 30 && c.keyword.split(' ').length >= 2)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 3)
        .map(({ keyword, impressions, position }) => ({ keyword, impressions, position }));
      if (!cancelled) setWins(picked);
    })()
      .catch((error) => console.warn('Could not load Search Console topics:', error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, brandId, websiteUrl, enabled]);
  return { wins, loading };
}

export function TopicStep({
  user,
  state,
  gscConnected,
  onBack,
  onNext,
}: {
  user: Authed;
  state: OnboardingState;
  gscConnected: boolean;
  onBack: () => void;
  onNext: (keyword: string, source: string) => void;
}) {
  const topics: TopicSuggestion[] = useMemo(() => state.topics || [], [state.topics]);
  const { wins, loading } = useQuickWins(user, state.brandId, state.websiteUrl, gscConnected);
  const [selected, setSelected] = useState<{ keyword: string; source: string } | null>(
    state.keyword ? { keyword: state.keyword, source: 'saved' } : null
  );
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!selected && wins[0]) setSelected({ keyword: wins[0].keyword, source: 'gsc' });
    else if (!selected && topics[0]) setSelected({ keyword: topics[0].keyword, source: 'suggested' });
  }, [wins, topics, selected]);

  const option = (keyword: string, source: string, detail: React.ReactNode, badge?: React.ReactNode) => {
    const active = selected?.keyword === keyword && !custom;
    return (
      <button
        key={`${source}-${keyword}`}
        type="button"
        onClick={() => {
          setCustom('');
          setSelected({ keyword, source });
        }}
        aria-pressed={active}
        className={`w-full rounded-xl border p-4 text-left transition ${
          active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold capitalize text-gray-900">{keyword}</span>
          {badge}
        </span>
        <span className="mt-1 block text-sm text-gray-600">{detail}</span>
      </button>
    );
  };

  const keyword = custom.trim() || selected?.keyword || '';

  return (
    <div>
      <StepHeader
        eyebrow="Step 4 of 4"
        title="What should your first article be about?"
        body="We picked these from what your customers search for on Google. Choose one, or type your own."
      />

      {gscConnected && (loading || wins.length > 0) && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Quick wins from your Search Console
          </p>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking at what Google already shows you for…
            </p>
          ) : (
            <div className="space-y-2">
              {wins.map((win) =>
                option(
                  win.keyword,
                  'gsc',
                  <>Google showed your site {win.impressions.toLocaleString()} times for this, at an average position of {win.position.toFixed(0)}. An article can move it up.</>,
                  <span className="flex-shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Quick win</span>
                )
              )}
            </div>
          )}
        </div>
      )}

      {topics.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested for your business</p>
          <div className="space-y-2">{topics.map((topic) => option(topic.keyword, 'suggested', topic.why))}</div>
        </div>
      )}

      <label htmlFor="custom" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Or write your own article keyword
      </label>
      <div className="relative">
        <input
          id="custom"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="how to waterproof a hiking backpack"
          className={`${inputClass} pr-40`}
        />
        <KeywordIdeaButton
          brandId={state.brandId}
          value={custom}
          onKeyword={setCustom}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Leave it empty and we&apos;ll suggest one from your business, or type an idea and we&apos;ll sharpen it.
      </p>

      <div className="mt-6 flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        <PrimaryButton disabled={keyword.length < 3} onClick={() => onNext(keyword, custom.trim() ? 'custom' : selected?.source || 'suggested')}>
          Write about this <ArrowRight className="h-4 w-4" />
        </PrimaryButton>
      </div>
    </div>
  );
}
