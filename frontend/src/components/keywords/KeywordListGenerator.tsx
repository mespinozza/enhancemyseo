'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';

const COUNTS = [10, 25, 50];

/**
 * Plans a batch of new article keywords for the brand, from its store and profile, for bulk
 * generation. Keywords already in the list are sent along so nothing comes back twice.
 */
export default function KeywordListGenerator({
  brandId,
  queued,
  onKeywords,
}: {
  brandId: string | undefined;
  queued: string[];
  onKeywords: (keywords: string[]) => void;
}) {
  const { user } = useAuth();
  const [count, setCount] = useState(25);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!user || !brandId) {
      toast.error('Pick a brand profile first');
      return;
    }
    setBusy(true);
    track('keyword_list', { count, focused: Boolean(focus.trim()) });
    try {
      const response = await fetch('/api/keywords/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ brandId, count, focus: focus.trim(), queued }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.keywords)) throw new Error(data.error || 'Could not build a keyword list');
      onKeywords(data.keywords);
      toast.success(`Added ${data.keywords.length} keyword${data.keywords.length === 1 ? '' : 's'}${data.usedStore ? ' from your store' : ''}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build a keyword list');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
      <input
        value={focus}
        onChange={(event) => setFocus(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), generate())}
        disabled={busy}
        maxLength={200}
        placeholder="Focus (optional), e.g. winter care"
        className="min-w-[12rem] flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />
      <select
        value={count}
        onChange={(event) => setCount(Number(event.target.value))}
        disabled={busy}
        aria-label="How many keywords"
        className="rounded-md border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-sm focus:border-violet-500 focus:outline-none"
      >
        {COUNTS.map((n) => (
          <option key={n} value={n}>
            {n} keywords
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        title="Plan a set of new keywords from your store and brand profile"
        className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {busy ? 'Planning your list…' : 'Generate a list for me'}
      </button>
    </div>
  );
}
