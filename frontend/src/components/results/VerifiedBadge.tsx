import { BadgeCheck } from 'lucide-react';

/**
 * Only shown where an admin has ticked "verified" on the case study, which means they
 * have seen the Search Console data behind the numbers. A badge that appeared on every
 * study would say nothing.
 */
export default function VerifiedBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === 'dark' ? 'bg-green-400/10 text-green-300' : 'bg-green-50 text-green-700'
      }`}
      title="An EnhanceMySEO admin has reviewed the Search Console data behind these numbers"
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      Verified results
    </span>
  );
}
