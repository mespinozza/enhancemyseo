/**
 * Browser-side analytics: GA4 (only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set), the
 * Meta Pixel loaded in the root layout, consent, and ad attribution.
 *
 * Every function is a no-op on the server, so components can call them freely.
 */

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { gtag?: Gtag; fbq?: Fbq };

const CONSENT_KEY = 'ems_consent';
const ATTRIBUTION_KEY = 'ems_attribution';
const PENDING_CHECKOUT_KEY = 'ems_pending_checkout';

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

function browser(): AnalyticsWindow | null {
  return typeof window === 'undefined' ? null : (window as AnalyticsWindow);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: attribution is best effort.
  }
}

// ─── Consent ──────────────────────────────────────────────────────────────────

export type Consent = 'granted' | 'denied' | null;

export function getConsent(): Consent {
  if (!browser()) return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(value: 'granted' | 'denied') {
  const w = browser();
  if (!w) return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // The choice still applies for this page view.
  }
  w.gtag?.('consent', 'update', {
    ad_storage: value,
    analytics_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
  w.fbq?.('consent', value === 'granted' ? 'grant' : 'revoke');
}

// ─── Attribution ──────────────────────────────────────────────────────────────

export const ATTRIBUTION_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'fbclid',
  'gclid',
  'ttclid',
  'angle',
] as const;

export type AttributionField = (typeof ATTRIBUTION_FIELDS)[number];

export type Attribution = Partial<Record<AttributionField, string>> & {
  landing_page?: string;
  captured_at?: string;
};

/**
 * Saves the campaign parameters of the current URL, if it has any. Last campaign touch
 * wins, matching how the ad platforms credit a conversion; visits without campaign
 * parameters leave the stored touch alone.
 */
export function captureAttribution(search: string, pathname: string) {
  if (!browser()) return;
  const params = new URLSearchParams(search);
  const found: Attribution = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = params.get(field);
    if (value) found[field] = value.slice(0, 100);
  }
  if (Object.keys(found).length === 0) return;
  writeJson(ATTRIBUTION_KEY, {
    ...found,
    landing_page: pathname.slice(0, 100),
    captured_at: new Date().toISOString(),
  });
}

export function readAttribution(): Attribution {
  if (!browser()) return {};
  return readJson<Attribution>(ATTRIBUTION_KEY) ?? {};
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventParams = Record<string, string | number | boolean | null | undefined>;

/** GA4 event names that have a Meta standard event equivalent. */
const META_STANDARD_EVENTS: Record<string, string> = {
  sign_up: 'CompleteRegistration',
  lp_view: 'ViewContent',
};

function clean(params: EventParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

/**
 * Sends one event to GA4 and the Meta Pixel. `meta: false` keeps it out of Meta, for
 * events the server already reports through the Conversions API.
 */
export function track(event: string, params: EventParams = {}, options: { meta?: boolean } = {}) {
  const w = browser();
  if (!w || getConsent() === 'denied') return;

  const attribution = readAttribution();
  const payload = clean({
    ad_source: attribution.utm_source,
    ad_campaign: attribution.utm_campaign,
    ad_creative: attribution.utm_content,
    ...params,
  });

  try {
    w.gtag?.('event', event, payload);
    if (options.meta !== false) {
      const standard = META_STANDARD_EVENTS[event];
      if (standard) w.fbq?.('track', standard, payload);
      else w.fbq?.('trackCustom', event, payload);
    }
  } catch {
    // A blocked or half-loaded tag must never break the page.
  }

  if (process.env.NODE_ENV === 'development') console.debug('[analytics]', event, payload);
}

// ─── Checkout hand-off ────────────────────────────────────────────────────────

export interface PendingCheckout {
  priceId: string;
  plan: string;
  interval: 'month' | 'year';
  value: number;
  fromPlan: string | null;
}

/** Stripe checkout leaves the site, so the purchase details wait here for the return. */
export function rememberCheckout(checkout: PendingCheckout) {
  if (!browser()) return;
  writeJson(PENDING_CHECKOUT_KEY, checkout);
}

export function takePendingCheckout(): PendingCheckout | null {
  if (!browser()) return null;
  const checkout = readJson<PendingCheckout>(PENDING_CHECKOUT_KEY);
  try {
    window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    // Nothing to clean up.
  }
  return checkout;
}
