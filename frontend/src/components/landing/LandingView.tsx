'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/** Reports the landing page view, so its CTAs can be measured against the article page's. */
export default function LandingView({ name }: { name: string }) {
  useEffect(() => {
    track('lp_view', { content_name: name });
  }, [name]);
  return null;
}
