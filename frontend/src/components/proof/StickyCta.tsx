'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { scrollToSection, useProofTrack, useSignupHref } from './ProofProvider';

/** Phones only: appears once the hero's own buttons have scrolled away. */
export default function StickyCta() {
  const [visible, setVisible] = useState(false);
  const send = useProofTrack();
  const signupHref = useSignupHref();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex gap-3">
        <Link
          href={signupHref}
          tabIndex={visible ? 0 : -1}
          onClick={() => send('cta_click', { location: 'sticky', label: 'Try Free', target: 'signup' })}
          className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3 text-center text-[15px] font-semibold text-white shadow-lg shadow-blue-600/30"
        >
          Try Free
        </Link>
        <button
          type="button"
          tabIndex={visible ? 0 : -1}
          onClick={() => {
            send('cta_click', { location: 'sticky', label: 'View Plans', target: 'plans' });
            scrollToSection('plans');
          }}
          className="flex-1 rounded-xl bg-white py-3 text-[15px] font-semibold text-gray-900 ring-1 ring-inset ring-gray-200"
        >
          View Plans
        </button>
      </div>
    </div>
  );
}
