'use client';

import { useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, Loader2, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

const TYPES = [
  { value: 'feature', label: 'Request a feature', icon: Lightbulb, chip: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { value: 'bug', label: 'Report a bug', icon: Bug, chip: 'bg-red-50 text-red-700 hover:bg-red-100' },
  { value: 'improvement', label: 'Suggest an improvement', icon: Sparkles, chip: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
] as const;

type FeedbackType = (typeof TYPES)[number]['value'];

/** Feedback straight to Featurebase, opened in place from one of the three kinds. */
export default function FeedbackCard() {
  const { user } = useAuth();
  const [type, setType] = useState<FeedbackType | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setType(null);
    setTitle('');
    setDescription('');
    setSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setSubmitting(true);
    try {
      await fetch('https://do.featurebase.app/api/v1/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          organization: 'enhancemyseo',
          title,
          content: description,
          category: type,
          author_email: user?.email || '',
          tags: [type, 'dashboard-request'],
          metadata: { source: 'dashboard_quick_form', user_agent: navigator.userAgent, timestamp: new Date().toISOString() },
        }),
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      // Featurebase does not always answer cross-origin requests readably, so the
      // thank-you shows either way, as it did before.
      setSubmitting(false);
      setSent(true);
      setTimeout(reset, 2500);
    }
  };

  const current = TYPES.find((t) => t.value === type);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100">
          <MessageSquarePlus className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">Help us improve</h2>
          <p className="text-xs text-gray-500">Ideas and bug reports go straight to the team.</p>
        </div>
      </div>

      {sent ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Thanks! We&apos;ve got it.
        </p>
      ) : current ? (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${current.chip}`}>
              <current.icon className="h-3.5 w-3.5" /> {current.label}
            </span>
            <button type="button" onClick={reset} aria-label="Cancel" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short title"
            required
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'bug' ? 'What happened, and what did you expect?' : 'Tell us more'}
            rows={3}
            required
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim() || !description.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${t.chip}`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
