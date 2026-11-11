'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';

/**
 * Fills a keyword field with AI: from the brand profile when the field is empty, or by
 * refining what was typed into a keyword worth writing for.
 */
export default function KeywordIdeaButton({
  brandId,
  value,
  onKeyword,
  className = '',
  compact = false,
}: {
  brandId: string | undefined;
  value: string;
  onKeyword: (keyword: string) => void;
  className?: string;
  /** Icon only, for repeated rows where a full label on every line is noise. */
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const seed = value.trim();

  const generate = async () => {
    if (!user || !brandId) {
      toast.error('Pick a brand profile first');
      return;
    }
    setBusy(true);
    track('keyword_idea', { seeded: Boolean(seed) });
    try {
      const response = await fetch('/api/keywords/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ brandId, seed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.keyword) throw new Error(data.error || 'Could not come up with a keyword');
      onKeyword(data.keyword);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not come up with a keyword');
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? 'Thinking…' : seed ? 'Improve with AI' : 'Surprise me';
  const hint = seed ? 'Turn what you typed into a keyword for your brand' : 'Suggest a keyword from your brand profile';

  if (compact) {
    return (
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title={`${label}: ${hint.toLowerCase()}`}
        aria-label={label}
        className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-100 hover:text-blue-700 disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={generate}
      disabled={busy}
      title={hint}
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-blue-700 to-blue-500 px-3 py-1 text-xs text-white shadow-sm transition-all hover:from-blue-800 hover:to-blue-600 disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {label}
    </button>
  );
}
