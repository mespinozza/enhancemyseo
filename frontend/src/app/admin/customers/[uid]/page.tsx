'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Copy, ExternalLink, Loader2, RotateCcw, X } from 'lucide-react';
import StorefrontPreview from '@/components/article-preview/StorefrontPreview';
import AdminGate from '@/components/results/AdminGate';
import { useAuth } from '@/lib/firebase/auth-context';
import DailyCostChart from '@/components/admin/DailyCostChart';
import {
  ASSIGNABLE_PLANS,
  PLAN_LABELS,
  type AdminArticle,
  type CustomerDetail,
  type Plan,
} from '@/lib/admin/customers';
import { PLAN_STYLES, money, relative, shortDate } from '@/components/admin/format';

const RUN_STYLES: Record<string, string> = {
  succeeded: 'text-green-700',
  failed: 'text-red-600',
  skipped: 'text-gray-500',
  running: 'text-blue-600',
  queued: 'text-blue-600',
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm text-gray-500">{children}</p>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

type PendingAction = { kind: 'setPlan'; plan: Plan } | { kind: 'resetUsage' };

function Customer() {
  const { user } = useAuth();
  const { uid } = useParams<{ uid: string }>();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [planChoice, setPlanChoice] = useState<Plan | ''>('');

  const [viewing, setViewing] = useState<{ id: string; article: AdminArticle | null } | null>(null);

  const openArticle = async (id: string) => {
    if (!user) return;
    setViewing({ id, article: null });
    try {
      const response = await fetch(
        `/api/admin/customers/${encodeURIComponent(uid)}/articles/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${await user.getIdToken()}` } },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load article');
      setViewing((current) => (current?.id === id ? { id, article: result } : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load article');
      setViewing(null);
    }
  };

  useEffect(() => {
    if (!viewing) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setViewing(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load customer');
      setDetail(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [user, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!user || !pending) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          pending.kind === 'setPlan'
            ? { action: 'setPlan', plan: pending.plan }
            : { action: 'resetUsage' },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Action failed');
      toast.success(result.detail || 'Done');
      setPending(null);
      setPlanChoice('');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 text-center text-gray-600">
        Customer not found.{' '}
        <Link href="/admin/customers" className="text-blue-600 hover:underline">
          Back to customers
        </Link>
      </div>
    );
  }

  const { customer } = detail;
  const isAdmin = customer.plan === 'admin';
  const monthCost = detail.dailyCost.reduce((sum, entry) => sum + entry.cost, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Customers
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="break-all text-2xl font-bold text-gray-900">
              {customer.email ?? customer.uid}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_STYLES[customer.plan]}`}>
              {PLAN_LABELS[customer.plan]}
            </span>
            {customer.cancelAtPeriodEnd && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                Cancelling {shortDate(customer.renewsAt)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {customer.name ?? 'No name'} · {customer.uid}
            {!customer.emailVerified && ' · email not verified'}
          </p>
        </div>

        <section className="rounded-lg bg-white p-5 shadow">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Joined" value={shortDate(customer.joinedAt)} />
            <Fact label="Last seen" value={relative(customer.lastSignInAt)} />
            <Fact
              label="Billing"
              value={
                customer.mrr
                  ? `${money(customer.mrr)}/mo${customer.billingInterval === 'year' ? ' (yearly)' : ''}`
                  : detail.hasStripeSubscription
                    ? 'Stripe, amount unknown'
                    : 'Not billed'
              }
            />
            <Fact
              label="Articles this month"
              value={`${customer.articlesThisMonth} / ${
                customer.articleLimit === 'unlimited' ? '∞' : customer.articleLimit
              }`}
            />
            <Fact label="AI cost this month" value={money(customer.aiCostThisMonth, 2)} />
            <Fact label="AI cost all time" value={money(customer.aiCostTotal, 2)} />
          </dl>
          {detail.stripeCustomerId && (
            <a
              href={`https://dashboard.stripe.com/customers/${detail.stripeCustomerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              Open in Stripe
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        {!isAdmin && (
          <Section title="Admin actions">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="plan" className="block text-sm font-medium text-gray-700">
                  Change plan
                </label>
                <div className="mt-1 flex gap-2">
                  <select
                    id="plan"
                    value={planChoice}
                    onChange={(event) => setPlanChoice(event.target.value as Plan | '')}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:max-w-xs"
                  >
                    <option value="">Choose a plan…</option>
                    {ASSIGNABLE_PLANS.filter((plan) => plan !== customer.plan).map((plan) => (
                      <option key={plan} value={plan}>
                        {PLAN_LABELS[plan]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!planChoice}
                    onClick={() => planChoice && setPending({ kind: 'setPlan', plan: planChoice })}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPending({ kind: 'resetUsage' })}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset this month&apos;s usage
              </button>
            </div>
          </Section>
        )}

        <Section
          title="AI cost this month"
          action={<span className="text-sm tabular-nums text-gray-500">{money(monthCost, 2)}</span>}
        >
          <div className="p-5">
            <DailyCostChart data={detail.dailyCost} />
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={`Brands (${detail.brands.length})`}>
            {detail.brands.length === 0 ? (
              <Empty>No brand profiles yet.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {detail.brands.map((brand) => (
                  <li key={brand.id} className="px-5 py-3 text-sm">
                    <div className="font-medium text-gray-900">{brand.name}</div>
                    {brand.website && <div className="truncate text-gray-500">{brand.website}</div>}
                  </li>
                ))}
              </ul>
            )}
            {detail.connections.length > 0 && (
              <ul className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-600">
                {detail.connections.map((connection) => (
                  <li key={`${connection.kind}-${connection.label}`} className="py-0.5">
                    {connection.kind === 'shopify' ? 'Shopify' : 'Search Console'}: {connection.label}
                    {connection.connectedAt && ` · since ${shortDate(connection.connectedAt)}`}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Automations (${detail.automations.length})`}>
            {detail.automations.length === 0 ? (
              <Empty>No automations.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {detail.automations.map((automation) => (
                  <li key={automation.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{automation.name}</div>
                      <div className="text-gray-500">
                        {automation.articlesPerRun} per run · last {relative(automation.lastRunAt)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        automation.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {automation.enabled ? 'On' : 'Off'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Recent articles">
          {detail.articles.length === 0 ? (
            <Empty>No articles yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Article</th>
                    <th className="px-5 py-2 text-left font-medium">Source</th>
                    <th className="px-5 py-2 text-right font-medium">AI cost</th>
                    <th className="px-5 py-2 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.articles.map((article) => (
                    <tr
                      key={article.id}
                      onClick={() => openArticle(article.id)}
                      className="cursor-pointer transition-colors hover:bg-blue-50/50"
                    >
                      <td className="max-w-md px-5 py-2.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openArticle(article.id);
                          }}
                          className="block max-w-full truncate text-left font-medium text-blue-700 hover:underline"
                        >
                          {article.title}
                        </button>
                        {article.keyword && <div className="truncate text-xs text-gray-500">{article.keyword}</div>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">
                        {article.createdBy === 'automation' ? 'Automation' : 'Manual'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-gray-700">
                        {article.aiCostUsd !== null ? money(article.aiCostUsd, 2) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-gray-600">{shortDate(article.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Recent automation runs">
          {detail.runs.length === 0 ? (
            <Empty>No automation runs.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {detail.runs.map((run) => (
                <li key={run.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">{run.articleTitle || run.keyword}</span>
                    <span className="text-xs text-gray-500">{shortDate(run.startedAt)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {run.automationName} ·{' '}
                    <span className={RUN_STYLES[run.status] ?? 'text-gray-600'}>{run.status}</span>
                  </div>
                  {(run.error || run.warning) && (
                    <div className={`mt-1 text-xs ${run.error ? 'text-red-600' : 'text-amber-700'}`}>
                      {run.error || run.warning}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Usage by month">
            {detail.usage.length === 0 ? (
              <Empty>No usage recorded.</Empty>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Month</th>
                    <th className="px-5 py-2 text-right font-medium">Articles</th>
                    <th className="px-5 py-2 text-right font-medium">Keywords</th>
                    <th className="px-5 py-2 text-right font-medium">AI cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.usage.map((entry) => (
                    <tr key={entry.month}>
                      <td className="px-5 py-2.5">{entry.month}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{entry.articles}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{entry.keywords}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {entry.aiRequests ? money(entry.aiCostUsd, 2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Admin history">
            {detail.actions.length === 0 ? (
              <Empty>No admin changes yet.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {detail.actions.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <div className="text-gray-900">{entry.detail}</div>
                    <div className="text-xs text-gray-500">
                      {entry.adminEmail ?? 'Admin'} · {shortDate(entry.at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={() => setViewing(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Article"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900">
                  {viewing.article?.title ?? 'Loading article…'}
                </h2>
                {viewing.article && (
                  <p className="truncate text-xs text-gray-500">
                    {[
                      viewing.article.keyword,
                      viewing.article.brandName,
                      viewing.article.status === 'published' ? 'Published' : 'Draft',
                      shortDate(viewing.article.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {viewing.article && (
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(viewing.article?.content ?? '')
                        .then(() => toast.success('HTML copied'))
                        .catch(() => toast.error('Could not copy'))
                    }
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy HTML
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  aria-label="Close"
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-5">
              {viewing.article ? (
                viewing.article.content ? (
                  <StorefrontPreview
                    title={viewing.article.title}
                    html={viewing.article.content}
                    seo={viewing.article.seo ?? undefined}
                    domain={viewing.article.website ?? undefined}
                    date={viewing.article.createdAt ? new Date(viewing.article.createdAt) : undefined}
                  />
                ) : (
                  <Empty>This article has no content saved.</Empty>
                )
              ) : (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {pending.kind === 'setPlan'
                ? `Move to ${PLAN_LABELS[pending.plan]}?`
                : "Reset this month's usage?"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {pending.kind === 'setPlan'
                ? `${customer.email ?? 'This customer'} goes from ${PLAN_LABELS[customer.plan]} to ${
                    PLAN_LABELS[pending.plan]
                  } straight away, without any charge.`
                : 'Article and keyword counts for this month go back to zero, so they can generate again. AI cost history is kept.'}
            </p>
            {pending.kind === 'setPlan' && detail.hasStripeSubscription && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                They have a Stripe subscription. Stripe keeps billing as before, and its next update
                (renewal, plan change or cancellation) puts them back on the plan they pay for.
                Change the subscription in Stripe to make it stick.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCustomerPage() {
  return (
    <AdminGate>
      <Customer />
    </AdminGate>
  );
}
