'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { thumbnailApi, type TokenUser } from '@/lib/thumbnail/client';
import { sendToArticles } from '@/lib/keywords/handoff';
import {
  CREATE_BATCH,
  PLAN_SIZES,
  describeRule,
  handleize,
  type CollectionPlan,
  type PlannedCollection,
  type ShopifyAccess,
} from '@/lib/collections/types';

const STAGES = [
  'Reading every product in your store',
  'Finding the words your product titles share',
  'Planning long-tail collections',
  'Testing every rule against your catalogue',
  'Holding back duplicates and thin pages',
];

const HELD_LABELS: Record<Exclude<PlannedCollection['status'], 'ready'>, string> = {
  thin: 'Too few products',
  broad: 'Too broad',
  duplicate: 'Already covered',
};

const thumb = (url: string) => `${url}${url.includes('?') ? '&' : '?'}width=160`;

interface Props {
  user: TokenUser;
  brandId: string;
  brandName: string;
  access: ShopifyAccess | null;
  /** No working Shopify connection: everything is shown but nothing can be planned. */
  locked: boolean;
  request: { focus: string; nonce: number } | null;
  onRequestTaken: () => void;
  onReconnect: () => void;
}

function Steps({ current }: { current: number }) {
  const steps = ['Plan from your catalogue', 'Review before anything is created', 'Create in Shopify'];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
              index < current ? 'bg-green-600 text-white' : index === current ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {index < current ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span className={index === current ? 'font-semibold text-gray-900' : 'text-gray-500'}>{label}</span>
          {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-gray-300" />}
        </li>
      ))}
    </ol>
  );
}

export default function CollectionPlanner({ user, brandId, brandName, access, locked, request, onRequestTaken, onReconnect }: Props) {
  const router = useRouter();
  const [plans, setPlans] = useState<CollectionPlan[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(25);
  const [minProducts, setMinProducts] = useState(4);
  const [planning, setPlanning] = useState(false);
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showHeld, setShowHeld] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { plans: list } = await thumbnailApi<{ plans: CollectionPlan[] }>(user, `/api/collection-plans?brandId=${encodeURIComponent(brandId)}`);
      setPlans(list);
      setActiveId(list[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load plans');
    } finally {
      setLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!planning) return;
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 10_000);
    return () => clearInterval(timer);
  }, [planning]);

  const active = plans.find((p) => p.id === activeId) ?? null;
  const ready = useMemo(() => active?.items.filter((i) => i.status === 'ready') ?? [], [active]);
  const heldBack = useMemo(() => active?.items.filter((i) => i.status !== 'ready') ?? [], [active]);
  const pending = useMemo(() => ready.filter((i) => !i.created), [ready]);
  const live = ready.filter((i) => i.created);

  useEffect(() => {
    setPicked(new Set(pending.map((i) => i.id)));
    setTitles({});
    setExpanded(new Set());
    // Reset only when switching plans, not when an item is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const plan = useCallback(
    async (focusText: string) => {
      if (locked) return;
      setPlanning(true);
      try {
        const { plan: created } = await thumbnailApi<{ plan: CollectionPlan }>(user, '/api/collection-plans', {
          method: 'POST',
          body: JSON.stringify({ brandId, focus: focusText, count, minProducts }),
        });
        setPlans((current) => [created, ...current]);
        setActiveId(created.id);
        toast.success(`${created.items.filter((i) => i.status === 'ready').length} collections ready to review`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Planning failed');
      } finally {
        setPlanning(false);
      }
    },
    [locked, user, brandId, count, minProducts],
  );

  useEffect(() => {
    if (!request) return;
    onRequestTaken();
    setFocus(request.focus);
    plan(request.focus);
    // Only a new request starts a plan, not a changed setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  const updateItems = (planId: string, items: PlannedCollection[]) =>
    setPlans((current) => current.map((p) => (p.id === planId ? { ...p, items } : p)));

  const needle = query.trim().toLowerCase();
  const visible = pending.concat(live).filter(
    (i) => !needle || [i.title, i.keyword, i.theme].some((text) => text.toLowerCase().includes(needle)),
  );
  const themes = Array.from(new Set(visible.map((i) => i.theme)));
  const chosen = pending.filter((i) => picked.has(i.id));
  const placements = chosen.reduce((n, i) => n + i.products, 0);
  const titleOf = (item: PlannedCollection) => titles[item.id] ?? item.title;

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleMany = (ids: string[]) =>
    setPicked((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });

  const createChosen = async () => {
    if (!active) return;
    setConfirming(false);
    const planId = active.id;
    const ids = chosen.map((i) => i.id);
    cancelled.current = false;
    setProgress({ done: 0, total: ids.length });
    let made = 0;
    let failed = 0;
    for (let start = 0; start < ids.length; start += CREATE_BATCH) {
      if (cancelled.current) break;
      const batch = ids.slice(start, start + CREATE_BATCH);
      try {
        const { items } = await thumbnailApi<{ items: PlannedCollection[] }>(user, `/api/collection-plans/${planId}/create`, {
          method: 'POST',
          body: JSON.stringify({
            itemIds: batch,
            titles: Object.fromEntries(batch.filter((id) => titles[id]?.trim()).map((id) => [id, titles[id].trim()])),
          }),
        });
        updateItems(planId, items);
        const results = items.filter((i) => batch.includes(i.id));
        made += results.filter((i) => i.created).length;
        failed += results.filter((i) => !i.created).length;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Shopify stopped creating collections');
        break;
      }
      setProgress({ done: Math.min(start + batch.length, ids.length), total: ids.length });
    }
    setProgress(null);
    setPicked(new Set());
    if (made) toast.success(`${made} collection${made === 1 ? '' : 's'} live in ${brandName}'s store`);
    if (failed) toast.error(`${failed} could not be created. The reason is shown on each one.`);
  };

  const removeLive = async (item: PlannedCollection) => {
    if (!active || !item.created) return;
    if (!window.confirm(`Delete “${item.title}” from your Shopify store? Products are not affected.`)) return;
    setRemoving(item.id);
    try {
      const { items } = await thumbnailApi<{ items: PlannedCollection[] }>(user, `/api/collection-plans/${active.id}/remove`, {
        method: 'POST',
        body: JSON.stringify({ itemIds: [item.id] }),
      });
      updateItems(active.id, items);
      toast.success('Removed from Shopify');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove it');
    } finally {
      setRemoving(null);
    }
  };

  const deletePlan = async (id: string) => {
    const target = plans.find((p) => p.id === id);
    const liveCount = target?.items.filter((i) => i.created).length ?? 0;
    const warning = liveCount ? ` Its ${liveCount} live collection${liveCount === 1 ? ' stays' : 's stay'} in Shopify.` : '';
    if (!window.confirm(`Delete this plan?${warning}`)) return;
    await thumbnailApi(user, `/api/collection-plans?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
    setPlans((current) => current.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(plans.find((p) => p.id !== id)?.id ?? null);
  };

  const writeArticles = () => {
    sendToArticles({ brandId, keywords: live.map((i) => i.keyword) });
    router.push('/dashboard/articles');
  };

  const step = progress ? 2 : active && pending.length ? 1 : active ? 3 : 0;
  const needsScopes = access?.connected && !access.canCreate;

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Steps current={step} />
          {locked && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              <Lock className="h-3.5 w-3.5" /> Needs a Shopify connection
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Each collection is a new page in your store aimed at one long-tail search, filled automatically by rules that match your product titles,
          vendors and prices. Nothing is created until you review the plan.
        </p>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] md:items-end">
          <div>
            <label htmlFor="plan-focus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Focus <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              id="plan-focus"
              value={focus}
              disabled={locked || planning}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="A vendor, product kind or room, e.g. Tiffany lamps or outdoor saunas"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label htmlFor="plan-count" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Collections
            </label>
            <select
              id="plan-count"
              value={count}
              disabled={locked || planning}
              onChange={(event) => setCount(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
            >
              {PLAN_SIZES.map((n) => (
                <option key={n} value={n}>
                  Up to {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="plan-min" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Min. products
            </label>
            <select
              id="plan-min"
              value={minProducts}
              disabled={locked || planning}
              onChange={(event) => setMinProducts(Number(event.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
            >
              {[2, 4, 8, 15].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => plan(focus)}
            disabled={planning || locked}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {locked ? <Lock className="h-4 w-4" /> : planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {planning ? 'Planning…' : 'Preview collections'}
          </button>
        </div>
        {planning && (
          <>
            <ol className="mt-4 grid gap-1.5 sm:grid-cols-5">
              {STAGES.map((label, index) => (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                    index < stage ? 'bg-green-50 text-green-700' : index === stage ? 'bg-blue-50 font-medium text-blue-700' : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  {index < stage ? <Check className="h-3.5 w-3.5" /> : index === stage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5" />}
                  {label}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-gray-400">About a minute. Nothing is created in Shopify at this step.</p>
          </>
        )}
      </section>

      {needsScopes && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <p className="text-sm text-blue-900">
              <span className="font-medium">Previews work now.</span> To create collections, reconnect {brandName}&apos;s store once and approve
              collection access. Shopify only asks for the new permissions; nothing else changes.
            </p>
          </div>
          <button type="button" onClick={onReconnect} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            Reconnect Shopify
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Plans</h2>
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">None yet for this brand.</p>
          ) : (
            <ul className="space-y-1.5">
              {plans.map((p) => {
                const readyCount = p.items.filter((i) => i.status === 'ready').length;
                const liveCount = p.items.filter((i) => i.created).length;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(p.id)}
                      className={`group flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                        p.id === activeId ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-500">
                          {liveCount ? `${liveCount} of ${readyCount} live` : `${readyCount} to review`}
                          {p.createdAt && ` · ${new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                        </span>
                      </span>
                      <Trash2
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          deletePlan(p.id);
                        }}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {!active ? (
            !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <Layers className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 font-medium text-gray-900">{locked ? 'Connect Shopify to plan collections' : 'Preview your first collections'}</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                  You&apos;ll see every proposed collection with its real products and rules first, then choose which ones to create.
                </p>
              </div>
            )
          ) : (
            <>
              <div className="sticky top-0 z-10 -mx-1 mb-4 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-gray-900">{active.name}</h2>
                    <p className="text-xs text-gray-500">
                      {ready.length} ready from {active.stats.catalog.toLocaleString()} products
                      {live.length > 0 && ` · ${live.length} live`}
                      {heldBack.length > 0 && ` · ${heldBack.length} held back`}
                    </p>
                  </div>
                  {progress ? (
                    <div className="flex min-w-[16rem] items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-gray-600">
                        {progress.done} / {progress.total}
                      </span>
                      <button
                        type="button"
                        onClick={() => (cancelled.current = true)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-800"
                      >
                        Stop
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {live.length > 0 && (
                        <button
                          type="button"
                          onClick={writeArticles}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <FileText className="h-4 w-4" /> Write articles for live pages
                        </button>
                      )}
                      {pending.length > 0 && (
                        <>
                          <span className="text-xs text-gray-500">
                            {chosen.length} selected · {placements.toLocaleString()} product placements
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            disabled={!chosen.length || !access?.canCreate}
                            title={access?.canCreate ? undefined : 'Reconnect Shopify to allow creating collections'}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                            {access?.canCreate ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            Create {chosen.length} in Shopify
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filter by title, keyword or theme"
                      className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  {pending.length > 0 && !progress && (
                    <button
                      type="button"
                      onClick={() => toggleMany(pending.map((i) => i.id))}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      {pending.every((i) => picked.has(i.id)) ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {themes.map((theme) => {
                  const items = visible.filter((i) => i.theme === theme);
                  const selectable = items.filter((i) => !i.created).map((i) => i.id);
                  return (
                    <div key={theme}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-gray-700">
                          {theme} <span className="font-normal text-gray-400">({items.length})</span>
                        </h3>
                        {selectable.length > 1 && !progress && (
                          <button type="button" onClick={() => toggleMany(selectable)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                            {selectable.every((id) => picked.has(id)) ? 'Clear' : 'Select'} group
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {items.map((item) => {
                          const isLive = Boolean(item.created);
                          const open = expanded.has(item.id);
                          return (
                            <article
                              key={item.id}
                              className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                                isLive ? 'border-green-200' : picked.has(item.id) ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {isLive ? (
                                  <span className="mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-green-600">
                                    <Check className="h-3 w-3 text-white" />
                                  </span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={picked.has(item.id)}
                                    disabled={Boolean(progress)}
                                    onChange={() => toggle(item.id)}
                                    className="mt-1 rounded text-blue-600"
                                    aria-label={`Create ${item.title}`}
                                  />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    {isLive ? (
                                      <p className="font-medium text-gray-900">{item.title}</p>
                                    ) : (
                                      <input
                                        value={titleOf(item)}
                                        disabled={Boolean(progress)}
                                        onChange={(event) => setTitles((current) => ({ ...current, [item.id]: event.target.value }))}
                                        className="-mx-1 w-full rounded border border-transparent px-1 font-medium text-gray-900 hover:border-gray-200 focus:border-blue-400 focus:outline-none"
                                        aria-label="Collection title"
                                      />
                                    )}
                                    <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700">
                                      {item.products.toLocaleString()} products
                                    </span>
                                  </div>
                                  <p className="mt-0.5 truncate text-xs text-gray-400">
                                    /collections/{isLive ? item.created!.handle : handleize(titleOf(item)) || item.handle}
                                  </p>
                                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-gray-600">
                                    <Search className="h-3 w-3" /> {item.keyword}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {item.rules.map((rule, index) => (
                                      <span key={index} className="inline-flex items-center gap-1">
                                        {index > 0 && <span className="text-[10px] font-semibold text-gray-400">{item.disjunctive ? 'OR' : 'AND'}</span>}
                                        <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 ring-1 ring-inset ring-gray-200">
                                          {describeRule(rule)}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                  {item.samples.length > 0 && (
                                    <div className="mt-3 flex gap-2">
                                      {item.samples.map((sample) => (
                                        <a
                                          key={sample.url}
                                          href={sample.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title={sample.title}
                                          className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
                                        >
                                          {sample.image && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={thumb(sample.image)} alt={sample.title} loading="lazy" className="h-full w-full object-cover" />
                                          )}
                                        </a>
                                      ))}
                                      {item.products > item.samples.length && (
                                        <span className="flex h-14 items-center px-1 text-xs text-gray-400">
                                          +{(item.products - item.samples.length).toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {item.error && (
                                    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {item.error}
                                    </p>
                                  )}
                                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpanded((current) => {
                                          const next = new Set(current);
                                          if (next.has(item.id)) next.delete(item.id);
                                          else next.add(item.id);
                                          return next;
                                        })
                                      }
                                      className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-800"
                                    >
                                      <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /> Page copy
                                    </button>
                                    {isLive && (
                                      <>
                                        <a href={item.created!.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-green-700 hover:text-green-900">
                                          <ExternalLink className="h-3.5 w-3.5" /> View page
                                        </a>
                                        <a href={item.created!.adminUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-800">
                                          <ExternalLink className="h-3.5 w-3.5" /> Edit in Shopify
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => removeLive(item)}
                                          disabled={removing === item.id}
                                          className="inline-flex items-center gap-1 font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
                                        >
                                          {removing === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                                          Remove
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {open && (
                                    <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3 text-xs">
                                      <div>
                                        <dt className="font-semibold text-gray-500">Search title</dt>
                                        <dd className="text-gray-800">{item.seoTitle}</dd>
                                      </div>
                                      <div>
                                        <dt className="font-semibold text-gray-500">Search description</dt>
                                        <dd className="text-gray-800">{item.seoDescription}</dd>
                                      </div>
                                      <div>
                                        <dt className="font-semibold text-gray-500">Top of the page</dt>
                                        <dd className="text-gray-800">{item.description}</dd>
                                      </div>
                                    </dl>
                                  )}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {visible.length === 0 && <p className="text-sm text-gray-500">Nothing matches that filter.</p>}
              </div>

              {heldBack.length > 0 && (
                <div className="mt-6 rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowHeld((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {heldBack.length} idea{heldBack.length === 1 ? '' : 's'} held back
                      <span className="ml-2 font-normal text-gray-400">empty, too broad, or already in your store</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition ${showHeld ? 'rotate-180' : ''}`} />
                  </button>
                  {showHeld && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                      {heldBack.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-gray-700">{item.title}</span>
                            <span className="text-xs text-gray-400">{item.rules.map(describeRule).join(item.disjunctive ? ' or ' : ' and ')}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-xs font-medium text-amber-700">{HELD_LABELS[item.status as keyof typeof HELD_LABELS]}</span>
                            <span className="text-xs text-gray-400">{item.note}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {confirming && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Create {chosen.length} collection{chosen.length === 1 ? '' : 's'} in {brandName}&apos;s store?
              </h2>
              <button type="button" onClick={() => setConfirming(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                {placements.toLocaleString()} product placements across {chosen.length} new pages, published to your Online Store.
              </li>
              <li className="flex gap-2">
                <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                They are smart collections, so new products that match the rules join on their own.
              </li>
              <li className="flex gap-2">
                <Undo2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                Any of them can be removed from here or from Shopify later. Your products are never changed.
              </li>
            </ul>
            <div className="mt-4 max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              {chosen.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 py-0.5">
                  <span className="truncate">{titleOf(item)}</span>
                  <span className="flex-shrink-0 tabular-nums text-gray-400">{item.products.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Keep reviewing
              </button>
              <button type="button" onClick={createChosen} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Create {chosen.length} collection{chosen.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
