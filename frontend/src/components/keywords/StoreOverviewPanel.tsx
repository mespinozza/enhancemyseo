'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Loader2, RefreshCw, Search, Sparkles, Store } from 'lucide-react';
import type { StoreOverview, StoreTopic } from '@/lib/keywords/collection-types';

type Tab = 'gaps' | 'collections' | 'vendors' | 'productTypes' | 'pages' | 'articles';

interface Props {
  brandName: string;
  overview: StoreOverview | null;
  loading: boolean;
  error: string | null;
  building: boolean;
  onBuild: (focus: string) => void;
  onRefresh: () => void;
}

const PAGE = 60;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2.5">
      <div className="text-lg font-bold tabular-nums text-gray-900">{value.toLocaleString()}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Coverage({ covered }: { covered: number }) {
  return covered === 0 ? (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">No articles yet</span>
  ) : (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-inset ring-green-200">
      {covered} article{covered === 1 ? '' : 's'}
    </span>
  );
}

export default function StoreOverviewPanel({ brandName, overview, loading, error, building, onBuild, onRefresh }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('gaps');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const gaps = useMemo(() => {
    if (!overview) return [];
    const tagged = (list: StoreTopic[], kind: string) => list.map((t) => ({ ...t, kind }));
    const seen = new Set<string>();
    // A vendor with its own collection is one gap, not two.
    return [...tagged(overview.collections, 'Collection'), ...tagged(overview.vendors, 'Vendor')]
      .filter((t) => t.products > 0 && t.covered === 0)
      .filter((t) => !seen.has(t.name.toLowerCase()) && Boolean(seen.add(t.name.toLowerCase())))
      .sort((a, b) => b.products - a.products);
  }, [overview]);

  const tabs: { id: Tab; label: string; count: number }[] = overview
    ? ([
        { id: 'gaps', label: 'Content gaps', count: gaps.length },
        { id: 'collections', label: 'Collections', count: overview.collections.length },
        { id: 'vendors', label: 'Vendors', count: overview.vendors.length },
        { id: 'productTypes', label: 'Product types', count: overview.productTypes.length },
        { id: 'pages', label: 'Pages', count: overview.pages.length },
        { id: 'articles', label: 'Blog posts', count: overview.articles.length },
      ] satisfies { id: Tab; label: string; count: number }[]).filter((t) => t.id === 'gaps' || t.count > 0)
    : [];

  const needle = query.trim().toLowerCase();
  const match = (text: string) => !needle || text.toLowerCase().includes(needle);

  const topicRows: (StoreTopic & { kind?: string })[] | null = !overview
    ? null
    : tab === 'gaps'
      ? gaps
      : tab === 'collections'
        ? overview.collections
        : tab === 'vendors'
          ? overview.vendors
          : tab === 'productTypes'
            ? overview.productTypes
            : null;
  const linkRows =
    overview && tab === 'pages'
      ? overview.pages.map((p) => ({ title: p.title, url: p.url, meta: '' }))
      : overview && tab === 'articles'
        ? overview.articles.map((a) => ({ title: a.title, url: a.url, meta: a.blog }))
        : null;

  const filteredTopics = topicRows?.filter((t) => match(t.name)) ?? [];
  const filteredLinks = linkRows?.filter((l) => match(l.title)) ?? [];
  const total = topicRows ? filteredTopics.length : filteredLinks.length;

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-center gap-2 text-left">
          <Store className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <span className="min-w-0">
            <span className="block font-semibold text-gray-900">What&apos;s in {brandName}&apos;s store</span>
            <span className="block text-xs text-gray-500">
              {overview
                ? `${overview.counts.products.toLocaleString()} products · ${gaps.length} content gap${gaps.length === 1 ? '' : 's'} with no article yet`
                : loading
                  ? 'Reading your store…'
                  : 'Products, collections, vendors, pages and blog posts'}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-2">
          {overview && (
            <a href={overview.storefront} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600">
              Open store <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Read the store again"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : !overview ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="Products" value={overview.counts.products} />
                <Stat label="Collections" value={overview.counts.collections} />
                <Stat label="Vendors" value={overview.counts.vendors} />
                <Stat label="Product types" value={overview.counts.productTypes} />
                <Stat label="Pages" value={overview.counts.pages} />
                <Stat label="Blog posts" value={overview.counts.shopifyArticles} />
              </div>
              {overview.missing.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Shopify didn&apos;t share {overview.missing.join(', ')}. Reconnecting the store with full permissions fixes this.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-0.5">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTab(t.id);
                        setShown(PAGE);
                      }}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {t.label} <span className="tabular-nums text-gray-400">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter"
                    className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {tab === 'gaps' && gaps.length > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  These have products for sale but no article that names them. Each is an easy win: build keywords for one and the articles link straight to it.
                </p>
              )}

              <ul className="mt-3 max-h-[26rem] divide-y divide-gray-50 overflow-y-auto rounded-lg border border-gray-100">
                {topicRows &&
                  filteredTopics.slice(0, shown).map((t) => (
                    <li key={`${t.kind ?? tab}:${t.name}`} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <a
                          href={t.url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm font-medium text-gray-900 hover:text-blue-600"
                        >
                          {t.name}
                        </a>
                        <span className="text-xs text-gray-500">
                          {t.kind ? `${t.kind} · ` : ''}
                          {t.products} product{t.products === 1 ? '' : 's'}
                        </span>
                      </span>
                      <Coverage covered={t.covered} />
                      <button
                        type="button"
                        onClick={() => onBuild(t.name)}
                        disabled={building}
                        className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Build keywords
                      </button>
                    </li>
                  ))}
                {linkRows &&
                  filteredLinks.slice(0, shown).map((l) => (
                    <li key={l.url + l.title} className="flex items-center gap-3 px-3 py-2">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-gray-900 hover:text-blue-600">
                        {l.title}
                      </a>
                      {l.meta && <span className="flex-shrink-0 text-xs text-gray-400">{l.meta}</span>}
                    </li>
                  ))}
                {total === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-gray-500">
                    {needle ? 'Nothing matches.' : tab === 'gaps' ? 'Every collection and vendor already has an article. Nice.' : 'None in this store.'}
                  </li>
                )}
              </ul>
              {total > shown && (
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800">
                  Show {Math.min(PAGE, total - shown)} more of {total - shown}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
