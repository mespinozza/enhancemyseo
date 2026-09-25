'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  ExternalLink,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';
import { useAuth } from '@/lib/firebase/auth-context';
import { CaseStudy } from '@/lib/results/types';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow">
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
    </div>
  );
}

function ManageCaseStudies() {
  const { user } = useAuth();
  const [studies, setStudies] = useState<CaseStudy[]>([]);
  const [newSubmissions, setNewSubmissions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<CaseStudy | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [studiesResponse, submissionsResponse] = await Promise.all([
        fetch('/api/results', { headers }),
        fetch('/api/results/submissions', { headers }),
      ]);

      const studiesResult = await studiesResponse.json();
      if (!studiesResponse.ok) throw new Error(studiesResult.error || 'Failed to load');
      setStudies(studiesResult.caseStudies);

      if (submissionsResponse.ok) {
        const { submissions } = await submissionsResponse.json();
        setNewSubmissions(
          submissions.filter((entry: { status: string }) => entry.status === 'new').length
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load case studies');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!user || !pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/results/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Delete failed');
      toast.success('Case study deleted');
      setPendingDelete(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const published = studies.filter((study) => study.published);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Case studies</h1>
            <p className="mt-1 text-gray-600">
              Customer results published at{' '}
              <Link href="/results" className="text-blue-600 hover:underline">
                /results
              </Link>
              .
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/results/submissions"
              className="relative inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Inbox className="h-4 w-4" />
              Submissions
              {newSubmissions > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {newSubmissions}
                </span>
              )}
            </Link>
            <Link
              href="/admin/results/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New case study
            </Link>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Total" value={studies.length} />
          <Stat label="Published" value={published.length} />
          <Stat label="Drafts" value={studies.length - published.length} />
          <Stat label="Verified" value={studies.filter((study) => study.verified).length} />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : studies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="text-lg font-semibold text-gray-900">No case studies yet</h2>
            <p className="mx-auto mt-2 max-w-md text-gray-600">
              Publish your first customer result, or start from something a customer sent in.
            </p>
            <Link
              href="/admin/results/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New case study
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Case study
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Clicks
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {studies.map((study) => (
                  <tr key={study.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        {study.title || 'Untitled'}
                        {study.featured && (
                          <Star
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                            aria-label="Featured"
                          />
                        )}
                        {study.verified && (
                          <BadgeCheck className="h-4 w-4 text-green-600" aria-label="Verified" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {study.storeName} · /results/{study.slug}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          study.published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {study.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-gray-700">
                      {study.metrics.clicksAfter?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {study.published && (
                          <a
                            href={`/results/${study.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="View live"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <Link
                          href={`/admin/results/${study.id}`}
                          className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(study)}
                          className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete this case study?</h2>
            <p className="mt-2 text-gray-600">
              &ldquo;{pendingDelete.title}&rdquo; will be removed permanently. Uploaded
              screenshots stay in storage.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminResultsPage() {
  return (
    <AdminGate>
      <ManageCaseStudies />
    </AdminGate>
  );
}
