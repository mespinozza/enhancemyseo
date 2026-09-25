'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, ExternalLink, Inbox, Loader2, Mail, Trash2 } from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';
import { useAuth } from '@/lib/firebase/auth-context';
import { ResultSubmission, SubmissionStatus, growthPercent } from '@/lib/results/types';

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  reviewing: 'bg-amber-100 text-amber-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
};

const STATUSES: SubmissionStatus[] = ['new', 'reviewing', 'published', 'archived'];

function Figure({ label, before, after }: { label: string; before: number | null; after: number | null }) {
  if (after === null && before === null) return null;
  const growth = growthPercent(before, after);

  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
        {before !== null ? before.toLocaleString() : '—'} → {after !== null ? after.toLocaleString() : '—'}
        {growth !== null && (
          <span className="ml-2 text-green-600">+{growth.toLocaleString()}%</span>
        )}
      </div>
    </div>
  );
}

function SubmissionsInbox() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<ResultSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/results/submissions', {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load');
      setSubmissions(result.submissions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (submission: ResultSubmission, status: SubmissionStatus) => {
    if (!user) return;
    setBusyId(submission.id);
    try {
      const response = await fetch(`/api/results/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Update failed');
      setSubmissions((current) =>
        current.map((entry) => (entry.id === submission.id ? { ...entry, status } : entry))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (submission: ResultSubmission) => {
    if (!user) return;
    setBusyId(submission.id);
    try {
      const response = await fetch(`/api/results/submissions/${submission.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Delete failed');
      setSubmissions((current) => current.filter((entry) => entry.id !== submission.id));
      toast.success('Submission deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/admin/results"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Case studies
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-gray-900">Submitted results</h1>
        <p className="mt-1 text-gray-600">
          Sent in by customers from the banner on the results page. Nothing here is public until
          you turn it into a case study yourself.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Nothing submitted yet</h2>
            <p className="mx-auto mt-2 max-w-md text-gray-600">
              When a customer sends their numbers through the results page, they will land here.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {submissions.map((submission) => (
              <article key={submission.id} className="rounded-lg bg-white p-6 shadow">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{submission.storeName}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          STATUS_STYLES[submission.status]
                        }`}
                      >
                        {submission.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {submission.name && `${submission.name} · `}
                      <a
                        href={`mailto:${submission.email}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {submission.email}
                      </a>
                      {' · '}
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </p>
                    {submission.storeUrl && (
                      <a
                        href={submission.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        {submission.storeUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={submission.status}
                      disabled={busyId === submission.id}
                      onChange={(event) =>
                        setStatus(submission, event.target.value as SubmissionStatus)
                      }
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(submission)}
                      disabled={busyId === submission.id}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                      aria-label="Delete submission"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Figure
                    label="Clicks"
                    before={submission.metrics.clicksBefore}
                    after={submission.metrics.clicksAfter}
                  />
                  <Figure
                    label="Impressions"
                    before={submission.metrics.impressionsBefore}
                    after={submission.metrics.impressionsAfter}
                  />
                </div>

                {submission.metrics.periodLabel && (
                  <p className="mt-3 text-sm text-gray-500">
                    Period: {submission.metrics.periodLabel}
                  </p>
                )}

                {submission.message && (
                  // Plain text, never HTML: this is untrusted input from a customer.
                  <p className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                    {submission.message}
                  </p>
                )}

                {submission.screenshots.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {submission.screenshots.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Submitted screenshot"
                          className="h-24 w-36 rounded-md border border-gray-200 object-cover transition-opacity hover:opacity-80"
                        />
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <Link
                    href="/admin/results/new"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Write this up as a case study →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <AdminGate>
      <SubmissionsInbox />
    </AdminGate>
  );
}
