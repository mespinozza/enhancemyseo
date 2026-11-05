'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  PLAN_LABELS,
  type CustomerRow,
  type CustomersResponse,
  type Plan,
} from '@/lib/admin/customers';
import DailyCostChart from '@/components/admin/DailyCostChart';
import { PLAN_STYLES, money, relative, shortDate } from '@/components/admin/format';

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow sm:p-5">
      <div className="text-xl font-bold tabular-nums text-gray-900 sm:text-2xl">{value}</div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

type SortKey =
  | 'joinedAt'
  | 'lastSignInAt'
  | 'mrr'
  | 'articlesThisMonth'
  | 'articlesTotal'
  | 'aiCostThisMonth';

const COLUMNS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: null, label: 'Customer' },
  { key: null, label: 'Plan' },
  { key: 'mrr', label: 'MRR', align: 'right' },
  { key: 'articlesThisMonth', label: 'This month', align: 'right' },
  { key: 'articlesTotal', label: 'All time', align: 'right' },
  { key: 'aiCostThisMonth', label: 'AI cost', align: 'right' },
  { key: null, label: 'Setup' },
  { key: 'joinedAt', label: 'Joined' },
  { key: 'lastSignInAt', label: 'Last seen' },
];

function sortValue(customer: CustomerRow, key: SortKey): number | string {
  const value = customer[key];
  return value ?? '';
}

function Customers() {
  const { user } = useAuth();
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<Plan | 'all' | 'paying'>('all');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'joinedAt',
    descending: true,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/admin/customers', {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load customers');
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    const filtered = data.customers.filter((customer) => {
      if (planFilter === 'paying' && customer.mrr <= 0) return false;
      if (planFilter !== 'all' && planFilter !== 'paying' && customer.plan !== planFilter) return false;
      if (!needle) return true;
      return (
        customer.email?.toLowerCase().includes(needle) ||
        customer.name?.toLowerCase().includes(needle) ||
        customer.uid.toLowerCase().includes(needle)
      );
    });
    return filtered.sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right));
      return sort.descending ? -order : order;
    });
  }, [data, query, planFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, descending: !current.descending } : { key, descending: true },
    );

  const summary = data?.summary;
  const maxSignups = Math.max(1, ...(summary?.signupsByMonth.map((entry) => entry.signups) ?? []));

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
            <p className="mt-1 text-gray-600">
              Plans, revenue, usage and AI spend for every account.{' '}
              <Link href="/admin/results" className="text-blue-600 hover:underline">
                Case studies
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {!data && loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : !data || !summary ? null : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              <Stat label="Monthly recurring revenue" value={money(summary.mrr)} />
              <Stat
                label="Paying customers"
                value={String(summary.payingCustomers)}
                hint={
                  summary.pendingCancellations
                    ? `${summary.pendingCancellations} cancelling at period end`
                    : undefined
                }
              />
              <Stat
                label="Free to paid"
                value={`${(summary.conversionRate * 100).toFixed(1)}%`}
                hint={`${summary.totalUsers} accounts`}
              />
              <Stat
                label="Active this month"
                value={String(summary.activeThisMonth)}
                hint={`${summary.newThisMonth} new`}
              />
              <Stat
                label="Articles this month"
                value={summary.articlesThisMonth.toLocaleString()}
              />
              <Stat
                label="AI cost this month"
                value={money(summary.aiCostThisMonth, 2)}
                hint={
                  summary.mrr
                    ? `${((summary.aiCostThisMonth / summary.mrr) * 100).toFixed(1)}% of MRR`
                    : undefined
                }
              />
            </div>

            {data.billingUnknown > 0 && (
              <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {data.billingUnknown} subscribers still need their billing details filled in from
                Stripe. Refresh to continue; each load fills in up to 25.
              </p>
            )}

            <div className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="overflow-hidden rounded-lg bg-white shadow lg:col-span-2">
                <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">
                  By plan
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-5 py-2 text-left font-medium">Plan</th>
                        <th className="px-5 py-2 text-right font-medium">Accounts</th>
                        <th className="px-5 py-2 text-right font-medium">MRR</th>
                        <th className="px-5 py-2 text-right font-medium">Articles</th>
                        <th className="px-5 py-2 text-right font-medium">AI cost</th>
                        <th className="px-5 py-2 text-right font-medium">Cost / article</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {summary.byPlan
                        .filter((entry) => entry.customers > 0)
                        .map((entry) => (
                          <tr key={entry.plan}>
                            <td className="px-5 py-2.5">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_STYLES[entry.plan]}`}
                              >
                                {PLAN_LABELS[entry.plan]}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums">{entry.customers}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums">{money(entry.mrr)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {entry.articlesThisMonth}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {money(entry.aiCostThisMonth, 2)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-gray-500">
                              {entry.articlesThisMonth && entry.aiCostThisMonth
                                ? money(entry.aiCostThisMonth / entry.articlesThisMonth, 2)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg bg-white p-5 shadow">
                <h2 className="text-sm font-semibold text-gray-900">Signups, last 6 months</h2>
                <div className="mt-4 flex h-36 items-end gap-2">
                  {summary.signupsByMonth.map((entry) => (
                    <div key={entry.month} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs tabular-nums text-gray-500">{entry.signups}</span>
                      <div
                        className="relative w-full overflow-hidden rounded-t bg-blue-100"
                        style={{ height: `${(entry.signups / maxSignups) * 100}%`, minHeight: 2 }}
                        title={`${entry.signups} signups, ${entry.paid} now paying`}
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 bg-blue-600"
                          style={{
                            height: entry.signups ? `${(entry.paid / entry.signups) * 100}%` : 0,
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{monthLabel(entry.month)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-blue-100" /> Signed up
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-blue-600" /> Now paying
                  </span>
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-lg bg-white p-5 shadow">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-gray-900">AI cost per day, this month</h2>
                <span className="text-sm tabular-nums text-gray-500">
                  {money(summary.aiCostThisMonth, 2)} total
                </span>
              </div>
              <DailyCostChart data={summary.dailyCost} />
            </div>

            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by email, name or ID"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={planFilter}
                  onChange={(event) => setPlanFilter(event.target.value as typeof planFilter)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All plans</option>
                  <option value="paying">Paying only</option>
                  {(Object.keys(PLAN_LABELS) as Plan[]).map((plan) => (
                    <option key={plan} value={plan}>
                      {PLAN_LABELS[plan]}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-gray-500 sm:ml-2">{rows.length} shown</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {COLUMNS.map((column) => (
                        <th
                          key={column.label}
                          className={`whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${
                            column.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {column.key ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(column.key as SortKey)}
                              className="inline-flex items-center gap-1 uppercase hover:text-gray-900"
                            >
                              {column.label}
                              {sort.key === column.key &&
                                (sort.descending ? (
                                  <ArrowDown className="h-3 w-3" />
                                ) : (
                                  <ArrowUp className="h-3 w-3" />
                                ))}
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((customer) => (
                      <tr key={customer.uid} className="hover:bg-gray-50">
                        <td className="max-w-[16rem] px-4 py-3">
                          <Link
                            href={`/admin/customers/${customer.uid}`}
                            className="block truncate font-medium text-gray-900 hover:text-blue-600 hover:underline"
                          >
                            {customer.email ?? customer.uid}
                          </Link>
                          <div className="truncate text-xs text-gray-500">
                            {customer.name ?? '—'}
                            {!customer.emailVerified && ' · unverified'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_STYLES[customer.plan]}`}
                          >
                            {PLAN_LABELS[customer.plan]}
                          </span>
                          {customer.cancelAtPeriodEnd && (
                            <div className="mt-1 text-xs text-red-600">
                              Ends {shortDate(customer.renewsAt)}
                            </div>
                          )}
                          {!customer.cancelAtPeriodEnd && customer.billingInterval && (
                            <div className="mt-1 text-xs text-gray-500">
                              {customer.billingInterval === 'year' ? 'Yearly' : 'Monthly'}
                              {customer.paidSince && ` since ${shortDate(customer.paidSince)}`}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {customer.mrr ? money(customer.mrr) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {customer.articlesThisMonth}
                          <span className="text-gray-400">
                            {' / '}
                            {customer.articleLimit === 'unlimited' ? '∞' : customer.articleLimit}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {customer.articlesTotal}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {customer.aiCostThisMonth ? money(customer.aiCostThisMonth, 2) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                          <div>
                            {customer.brands} brand{customer.brands === 1 ? '' : 's'} ·{' '}
                            {customer.activeAutomations}/{customer.automations} automations
                          </div>
                          <div className="mt-1 flex gap-3">
                            <Connection label="Shopify" connected={customer.shopifyConnected} />
                            <Connection label="GSC" connected={customer.searchConsoleConnected} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {shortDate(customer.joinedAt)}
                          {customer.source && (
                            <div className="mt-1 max-w-[10rem] truncate text-xs text-blue-600" title={customer.source}>
                              {customer.source}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {relative(customer.lastSignInAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-400">
              AI cost is recorded per call from the providers&apos; token counts at list price, and
              only covers generations since cost tracking was switched on. MRR uses each
              plan&apos;s list price, so coupons aren&apos;t reflected.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Connection({ label, connected }: { label: string; connected: boolean }) {
  const Icon = connected ? CheckCircle2 : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 ${connected ? 'text-green-700' : 'text-gray-400'}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export default function AdminCustomersPage() {
  return (
    <AdminGate>
      <Customers />
    </AdminGate>
  );
}
