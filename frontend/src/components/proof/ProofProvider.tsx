'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { captureAttribution, track, type EventParams } from '@/lib/analytics';
import type { Angle, Variants } from '@/lib/proof/experiments';

interface ProofContextValue {
  angle: Angle;
  variants: Variants;
}

const ProofContext = createContext<ProofContextValue | null>(null);

/** Every landing page event carries the ad angle and the visitor's test arms. */
export function useProofTrack() {
  const context = useContext(ProofContext);
  return useCallback(
    (event: string, params: EventParams = {}) => {
      track(event, {
        angle: context?.angle,
        hl: context?.variants.headline,
        pv: context?.variants.visual,
        cta_v: context?.variants.cta,
        ...params,
      });
    },
    [context]
  );
}

export function ProofProvider({
  angle,
  variants,
  children,
}: ProofContextValue & { children: React.ReactNode }) {
  const value = useRef({ angle, variants }).current;

  return (
    <ProofContext.Provider value={value}>
      <PageView />
      {children}
    </ProofContext.Provider>
  );
}

function PageView() {
  const send = useProofTrack();
  useEffect(() => {
    // Captured here as well as sitewide: the view event reads the campaign it belongs to,
    // and this effect runs before the sitewide one does.
    captureAttribution(window.location.search, window.location.pathname);
    send('lp_view', { content_name: 'proof' });
  }, [send]);
  return null;
}

// ─── Scroll reveal ────────────────────────────────────────────────────────────

/**
 * Fades its children in the first time they scroll into view, and optionally reports
 * that view. Content is visible without JavaScript and for reduced-motion users.
 */
export function Reveal({
  children,
  className = '',
  event,
  params,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  event?: string;
  params?: EventParams;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');
  const send = useProofTrack();
  const reported = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alreadyVisible = node.getBoundingClientRect().top < window.innerHeight;
    if (!reduced && !alreadyVisible) setState('hidden');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState('shown');
        if (event && !reported.current) {
          reported.current = true;
          send(event, params);
        }
        observer.disconnect();
      },
      { threshold: 0.25 }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // params is a literal at each call site; re-observing on identity change would re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, send]);

  const motion =
    state === 'hidden'
      ? 'translate-y-6 opacity-0'
      : state === 'shown'
        ? 'translate-y-0 opacity-100'
        : '';

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${motion} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// ─── CTAs ─────────────────────────────────────────────────────────────────────

export type CtaTarget = 'how' | 'plans' | 'case-study' | 'proof' | 'signup' | 'pricing';

const SECTION_IDS: Partial<Record<CtaTarget, string>> = {
  how: 'how-it-works',
  plans: 'plans',
  'case-study': 'case-study',
  proof: 'proof',
};

export const PRIMARY_CTA =
  'group relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/30 ring-1 ring-inset ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/40 active:translate-y-0 sm:text-base';

export const SECONDARY_CTA =
  'group inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-white/80 px-6 py-3.5 text-[15px] font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md hover:ring-blue-200 active:translate-y-0 sm:text-base';

export function scrollToSection(target: CtaTarget) {
  const id = SECTION_IDS[target];
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Signed-in visitors skip the signup form. */
export function useSignupHref() {
  const { user } = useAuth();
  return user ? '/dashboard' : '/login?signup=1';
}

export function CtaButton({
  label,
  target,
  location,
  tone = 'primary',
  className = '',
  arrow = tone === 'primary',
}: {
  label: string;
  target: CtaTarget;
  location: string;
  tone?: 'primary' | 'secondary';
  className?: string;
  arrow?: boolean;
}) {
  const send = useProofTrack();
  const signupHref = useSignupHref();
  const classes = `${tone === 'primary' ? PRIMARY_CTA : SECONDARY_CTA} ${className}`;

  const content = (
    <>
      {tone === 'primary' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[300%] motion-reduce:hidden"
        />
      )}
      {label}
      {arrow && (
        <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
      )}
    </>
  );

  const report = () => send('cta_click', { location, label, target });

  if (target === 'signup' || target === 'pricing') {
    return (
      <Link href={target === 'signup' ? signupHref : '/pricing'} onClick={report} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        report();
        scrollToSection(target);
      }}
      className={classes}
    >
      {content}
    </button>
  );
}
