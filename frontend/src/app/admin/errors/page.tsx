'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';
import { useAuth } from '@/lib/firebase/auth-context';
import { SOURCE_LABELS, type ErrorEvent, type ErrorSource } from '@/lib/errors/types';

const SOURCE_STYLES: Record<ErrorSource, string> = {
  article: 'bg-red-50 text-red-700 ring-red-200',
  'article-client': 'bg-amber-50 text-amber-700 ring-amber-200',
  automation: 'bg-purple-50 text-purple-700 ring-purple-200',
};

function when(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ErrorRow({ event }: { event: ErrorEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className="w-28 flex-shrink-0 pt-0.5 text-xs tabular-nums text-gray-500">{when(event.createdAt)}</span>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SOURCE_STYLES[event.source] ?? ''}`}>
          {SOURCE_LABELS[event.source] ?? event.source}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{event.message}</span>
          <span className="block truncate text-xs text-gray-500">
            {[event.email, event.keyword && `“${event.keyword}”`, event.status && `HTTP ${event.status}`, event.code].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronDown className={`mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {event.uid && (
              <Link href={`/admin/customers/${event.uid}`} className="text-blue-600 hover:underline">
                Open customer
              </Link>
            )}
            {event.stage && <span>Last step: {event.stage}</span>}
            {event.blogId && <span>Article {event.blogId}</span>}
            {event.context &&
              Object.entries(event.context)
                .filter(([, value]) => value !== null && value !== '')
                .map(([key, value]) => (
                  <span key={key}>
                    {key}: {String(value)}
                  </span>
                ))}
          </div>
          {event.detail && <pre className="whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-[11px] ring-1 ring-gray-200">{event.detail}</pre>}
          {event.log.length > 0 && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-2 font-mono text-[11px] text-gray-100">
              {event.log.join('\n')}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

function Errors() {
  const { user } = useAuth();
  const [events, setEvents] = useState<ErrorEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<ErrorSource | 'all'>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/errors', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load errors');
      setEvents(result.events);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load errors');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (events ?? []).filter(
      (e) =>
        (source === 'all' || e.source === source) &&
        (!needle || [e.message, e.email, e.keyword, e.detail].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [events, source, query]);

  const today = (events ?? []).filter((e) => e.createdAt && Date.now() - new Date(e.createdAt).getTime() < 86_400_000).length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Errors</h1>
            <p className="mt-1 text-gray-600">
              Failed article generations and automation runs, newest first. {events && `${today} in the last 24 hours.`}{' '}
              <Link href="/admin/customers" className="text-blue-600 hover:underline">
                Customers
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search message, email or keyword"
              className="w-full rounded-md border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as ErrorSource | 'all')}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none"
          >
            <option value="all">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {loading && !events ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
            {events?.length ? 'Nothing matches.' : 'No errors recorded yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg shadow ring-1 ring-gray-200">
            {rows.map((event) => (
              <ErrorRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminErrorsPage() {
  return (
    <AdminGate>
      <Errors />
    </AdminGate>
  );
}
