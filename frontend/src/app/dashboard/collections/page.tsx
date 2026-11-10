'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Check,
  ClipboardCopy,
  FileText,
  Layers,
  Link2,
  Loader2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import { thumbnailApi } from '@/lib/thumbnail/client';
import { CONTENT_BLUEPRINTS } from '@/lib/article/enhanced/blueprints';
import { INTENT_LABELS, type KeywordCollection, type KeywordIdea } from '@/lib/keywords/collection-types';
import { sendToArticles, sendToAutomation } from '@/lib/keywords/handoff';

const BRAND_KEY = 'keyword-collections-brand';

const STAGES = [
  'Reading your products and vendors',
  'Reading collections and pages',
  'Checking the articles you already have',
  'Finding long-tail keywords',
  'Removing anything already covered',
];

const INTENT_STYLES: Record<KeywordIdea['intent'], string> = {
  buying: 'bg-green-50 text-green-700 ring-green-200',
  comparing: 'bg-purple-50 text-purple-700 ring-purple-200',
  'how-to': 'bg-blue-50 text-blue-700 ring-blue-200',
  problem: 'bg-amber-50 text-amber-700 ring-amber-200',
  informational: 'bg-gray-50 text-gray-600 ring-gray-200',
};

const LINK_LABELS: Record<NonNullable<KeywordIdea['linkTo']>['kind'], string> = {
  collection: 'Collection',
  vendor: 'Vendor',
  product_type: 'Product type',
  page: 'Page',
};

const contentLabel = (value: string | null) => (value ? CONTENT_BLUEPRINTS.find((b) => b.value === value)?.label ?? null : null);

export default function KeywordCollectionsPage() {
  const { user, subscription_status } = useAuth();
  const router = useRouter();
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [brandId, setBrandId] = useState('');
  const [collections, setCollections] = useState<KeywordCollection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(40);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && subscription_status && subscription_status !== 'admin') router.push('/dashboard/articles');
  }, [user, subscription_status, router]);

  useEffect(() => {
    if (!user) return;
    brandProfileOperations.getAll(user.uid).then((profiles) => {
      setBrands(profiles);
      const saved = localStorage.getItem(BRAND_KEY);
      const initial = profiles.find((b) => b.id === saved && b.shopifyStoreUrl) ?? profiles.find((b) => b.shopifyStoreUrl) ?? profiles[0];
      if (initial?.id) setBrandId(initial.id);
      else setLoading(false);
    });
  }, [user]);

  const brand = brands.find((b) => b.id === brandId);

  const load = useCallback(async () => {
    if (!user || !brandId) return;
    setLoading(true);
    try {
      const { collections: list } = await thumbnailApi<{ collections: KeywordCollection[] }>(
        user,
        `/api/keyword-collections?brandId=${encodeURIComponent(brandId)}`,
      );
      setCollections(list);
      setActiveId(list[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load collections');
    } finally {
      setLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    if (!brandId) return;
    localStorage.setItem(BRAND_KEY, brandId);
    load();
  }, [brandId, load]);

  useEffect(() => {
    if (!generating) return;
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 7000);
    return () => clearInterval(timer);
  }, [generating]);

  const active = collections.find((c) => c.id === activeId) ?? null;
  const allKeywords = useMemo(() => active?.groups.flatMap((g) => g.keywords.map((k) => k.keyword)) ?? [], [active]);

  useEffect(() => {
    setPicked(new Set(allKeywords));
  }, [allKeywords]);

  const generate = async () => {
    if (!user || !brandId) return;
    setGenerating(true);
    try {
      const { collection } = await thumbnailApi<{ collection: KeywordCollection }>(user, '/api/keyword-collections', {
        method: 'POST',
        body: JSON.stringify({ brandId, focus, count }),
      });
      setCollections((current) => [collection, ...current]);
      setActiveId(collection.id);
      toast.success(`${collection.groups.reduce((n, g) => n + g.keywords.length, 0)} new keywords`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const toggle = (keyword: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });

  const toggleGroup = (keywords: string[]) =>
    setPicked((current) => {
      const next = new Set(current);
      const all = keywords.every((k) => next.has(k));
      keywords.forEach((k) => (all ? next.delete(k) : next.add(k)));
      return next;
    });

  const chosen = allKeywords.filter((k) => picked.has(k));

  const write = () => {
    sendToArticles({ brandId, keywords: chosen });
    router.push('/dashboard/articles');
  };
  const automate = () => {
    sendToAutomation({ brandId, name: active?.name ?? 'Keyword collection', topics: chosen });
    router.push('/dashboard/automate');
  };
  const copy = () =>
    navigator.clipboard
      .writeText(chosen.join('\n'))
      .then(() => toast.success(`${chosen.length} keywords copied`))
      .catch(() => toast.error('Could not copy'));

  const remove = async (id: string) => {
    if (!user || !window.confirm('Delete this keyword collection?')) return;
    await thumbnailApi(user, `/api/keyword-collections?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
    setCollections((current) => current.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(collections.find((c) => c.id !== id)?.id ?? null);
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Keyword collections</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Long-tail keywords built from what your store actually sells: its products, vendors, collections and pages.
            Anything your blog already covers is left out, and every keyword comes with the page it should link to.
          </p>
        </div>
        {brands.length > 0 && (
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.brandName}
                {b.shopifyStoreUrl ? '' : ' (no Shopify)'}
              </option>
            ))}
          </select>
        )}
      </header>

      {brand && !brand.shopifyStoreUrl ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <ShoppingBag className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Connect Shopify for {brand.brandName}</p>
              <p className="mt-0.5 text-sm text-amber-800">Keyword collections are planned around the store&apos;s products, vendors, collections and existing blog posts.</p>
            </div>
          </div>
          <Link href="/dashboard/settings/brands" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            Connect store
          </Link>
        </div>
      ) : (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_auto] md:items-end">
            <div>
              <label htmlFor="focus" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Focus <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <input
                id="focus"
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="A vendor, collection or season, e.g. Frymaster fryer parts"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label htmlFor="count" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                How many
              </label>
              <select
                id="count"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {[20, 40, 60, 80].map((n) => (
                  <option key={n} value={n}>
                    About {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={generating || !brandId}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Building…' : 'Build keyword collection'}
            </button>
          </div>
          {generating && (
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
          )}
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Saved collections</h2>
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : collections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">None yet for this brand.</p>
          ) : (
            <ul className="space-y-1.5">
              {collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`group flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition ${
                      c.id === activeId ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{c.name}</span>
                      <span className="text-xs text-gray-500">
                        {c.groups.reduce((n, g) => n + g.keywords.length, 0)} keywords
                        {c.createdAt && ` · ${new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                      </span>
                    </span>
                    <Trash2
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(c.id);
                      }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {!active ? (
            !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <Layers className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 font-medium text-gray-900">Build your first keyword collection</p>
                <p className="mt-1 text-sm text-gray-500">It takes about half a minute and reads your store, not a generic keyword list.</p>
              </div>
            )
          ) : (
            <>
              <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-gray-900">{active.name}</h2>
                  <p className="text-xs text-gray-500">
                    From {active.stats.products} products, {active.stats.vendors} vendors, {active.stats.collections} collections and {active.stats.pages} pages
                    {active.stats.alreadyCovered > 0 && ` · ${active.stats.alreadyCovered} skipped as already covered`}
                  </p>
                  {active.missing.length > 0 && (
                    <p className="text-xs text-amber-700">Shopify did not share: {active.missing.join(', ')}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">{chosen.length} selected</span>
                  <button type="button" onClick={copy} disabled={!chosen.length} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                    <ClipboardCopy className="h-4 w-4" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={automate}
                    disabled={!chosen.length}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Workflow className="h-4 w-4" /> Automate
                  </button>
                  <button
                    type="button"
                    onClick={write}
                    disabled={!chosen.length}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4" /> Write articles
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {active.groups.map((group) => {
                  const keys = group.keywords.map((k) => k.keyword);
                  const all = keys.every((k) => picked.has(k));
                  return (
                    <div key={group.theme} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                        <h3 className="truncate text-sm font-semibold text-gray-900">{group.theme}</h3>
                        <button type="button" onClick={() => toggleGroup(keys)} className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800">
                          {all ? 'Clear' : 'Select all'} ({keys.length})
                        </button>
                      </div>
                      <ul className="divide-y divide-gray-50">
                        {group.keywords.map((idea) => (
                          <li key={idea.keyword}>
                            <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                              <input type="checkbox" checked={picked.has(idea.keyword)} onChange={() => toggle(idea.keyword)} className="mt-0.5 rounded text-blue-600" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-gray-900">{idea.keyword}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${INTENT_STYLES[idea.intent]}`}>
                                    {INTENT_LABELS[idea.intent]}
                                  </span>
                                  {contentLabel(idea.contentType) && <span className="text-[11px] text-gray-500">{contentLabel(idea.contentType)}</span>}
                                  {idea.linkTo && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                      <Link2 className="h-3 w-3" />
                                      {LINK_LABELS[idea.linkTo.kind]}: {idea.linkTo.name}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
