'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  GA_MEASUREMENT_ID,
  captureAttribution,
  getConsent,
  readAttribution,
  setConsent,
  takePendingCheckout,
  track,
} from '@/lib/analytics';

/** EEA, UK and Switzerland: analytics and ad storage wait for an explicit opt-in. */
const OPT_IN_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE',
  'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'GB', 'CH',
];

const CONSENT_DEFAULTS = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var stored = null;
try { stored = localStorage.getItem('ems_consent'); } catch (e) {}
var denied = { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
var granted = { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
gtag('consent', 'default', Object.assign({ region: ${JSON.stringify(OPT_IN_REGIONS)}, wait_for_update: 500 }, denied));
gtag('consent', 'default', stored === 'denied' ? denied : granted);
if (stored === 'granted') gtag('consent', 'update', granted);
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');
`;

function Runtime() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    captureAttribution(search, pathname);
  }, [pathname, search]);

  // Stripe returns paying customers to /dashboard?success=true&session_id=…
  useEffect(() => {
    if (pathname !== '/dashboard') return;
    const params = new URLSearchParams(search);
    const sessionId = params.get('session_id');
    if (params.get('success') !== 'true' || !sessionId) return;

    const checkout = takePendingCheckout();
    if (!checkout) return;

    const fromPlan = checkout.fromPlan ?? 'free';
    track(
      'purchase',
      {
        transaction_id: sessionId,
        currency: 'USD',
        value: checkout.value,
        plan: checkout.plan,
        interval: checkout.interval,
        from_plan: fromPlan,
        angle: readAttribution().angle,
      },
      // Meta gets the Purchase from the Stripe webhook through the Conversions API.
      { meta: false }
    );
    if (fromPlan !== 'free') {
      track('upgrade', { from_plan: fromPlan, to_plan: checkout.plan, value: checkout.value }, { meta: false });
    } else {
      track('free_to_paid', { plan: checkout.plan, value: checkout.value }, { meta: false });
    }
  }, [pathname, search]);

  return null;
}

function ConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  if (!visible || pathname?.startsWith('/dashboard')) return null;

  const choose = (value: 'granted' | 'denied') => {
    setConsent(value);
    setVisible(false);
  };

  // On /proof the sticky mobile CTA owns the bottom of the screen, so sit above it.
  const offset = pathname === '/proof' ? 'bottom-[5.5rem] md:bottom-4' : 'bottom-4';

  return (
    <div
      role="region"
      aria-label="Cookie preferences"
      className={`fixed inset-x-3 z-[60] mx-auto max-w-md rounded-xl border border-gray-200 bg-white/95 p-3 text-xs text-gray-600 shadow-lg backdrop-blur sm:left-4 sm:right-auto ${offset}`}
    >
      <p>
        We use cookies to measure our ads and improve the site.{' '}
        <Link href="/privacy-policy" className="font-medium text-blue-600 hover:underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => choose('denied')}
          className="rounded-lg px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose('granted')}
          className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

export default function Analytics() {
  return (
    <>
      {GA_MEASUREMENT_ID && (
        <>
          <Script id="ga-consent" strategy="afterInteractive">
            {CONSENT_DEFAULTS}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
        </>
      )}
      <Runtime />
      <ConsentBanner />
    </>
  );
}
