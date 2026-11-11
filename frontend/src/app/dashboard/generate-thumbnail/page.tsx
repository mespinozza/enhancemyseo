'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Check,
  ExternalLink,
  ImageIcon,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import { thumbnailApi, useAuthedImage } from '@/lib/thumbnail/client';
import { THUMBNAIL_TIERS, type ThumbnailRecord, type ThumbnailTarget } from '@/lib/thumbnail/types';
import type { ThumbnailLayout } from '@/lib/thumbnail/design';
import BuyCredits from '@/components/credits/BuyCredits';
import StylePicker from '@/components/thumbnail/StylePicker';
import UsageMeter from '@/components/usage/UsageMeter';
import { useCreditReturn } from '@/lib/credits/client';
import { announceUsageChange, describeAllowance, useAllowance } from '@/lib/allowance';
import type { StudioArticle } from '@/app/api/thumbnails/articles/route';
import ThumbnailEditor, { targetValue, type LinkOption } from '@/components/thumbnail/ThumbnailEditor';

interface ShopifyArticle {
  id: number;
  title: string;
  blog_id: number;
  blog_title?: string;
  image?: { src: string } | null;
}

interface Source {
  value: string;
  title: string;
  keyword: string | null;
  target: ThumbnailTarget | null;
  hasImage: boolean;
}

const BRAND_KEY = 'thumbnail-studio-brand';

const STATUS_STYLES: Record<ThumbnailRecord['status'], string> = {
  draft: 'bg-gray-50 text-gray-600 ring-gray-200',
  linked: 'bg-blue-50 text-blue-700 ring-blue-200',
  pushed: 'bg-green-50 text-green-700 ring-green-200',
};
const STATUS_LABELS: Record<ThumbnailRecord['status'], string> = { draft: 'Not linked', linked: 'Linked', pushed: 'In Shopify' };

function ThumbnailCard({
  thumbnail,
  linkLabel,
  selected,
  busy,
  onToggle,
  onOpen,
  onRegenerate,
}: {
  thumbnail: ThumbnailRecord;
  linkLabel: string | null;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRegenerate: () => void;
}) {
  const { user } = useAuth();
  const authed = useAuthedImage(user, thumbnail.imageUrl ? null : thumbnail.previewUrl);
  const src = thumbnail.imageUrl ?? authed;
  return (
    <div
      className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-200'
      }`}
    >
      <button type="button" onClick={onOpen} className="relative block aspect-video w-full bg-gray-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage URLs and blob URLs, not Next image hosts
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 animate-pulse bg-gray-100" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-gray-900/0 opacity-0 transition group-hover:bg-gray-900/30 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </span>
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </span>
        )}
      </button>
      <div className="flex items-start gap-2.5 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={selected ? 'Deselect' : 'Select'}
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition ${
            selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">{thumbnail.design.title || thumbnail.title}</p>
          <p className="mt-1 truncate text-xs text-gray-500">{linkLabel ?? 'Not linked to an article'}</p>
          {thumbnail.error && <p className="mt-1 line-clamp-2 text-xs text-red-600">{thumbnail.error}</p>}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLES[thumbnail.status]}`}>
            {STATUS_LABELS[thumbnail.status]}
          </span>
          {thumbnail.shopifyAdminUrl && (
            <a href={thumbnail.shopifyAdminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-blue-600">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {thumbnail.locked ? (
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              title="New photo, keeping the text and layout"
              className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-blue-600 disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> New photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ThumbnailStudioPage() {
  const { user, subscription_status } = useAuth();
  const router = useRouter();
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [brandId, setBrandId] = useState('');
  const [appArticles, setAppArticles] = useState<StudioArticle[]>([]);
  const [shopifyArticles, setShopifyArticles] = useState<ShopifyArticle[]>([]);
  const [shopifyState, setShopifyState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [thumbnails, setThumbnails] = useState<ThumbnailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'app' | 'shopify'>('app');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customTitle, setCustomTitle] = useState('');
  const [layout, setLayout] = useState<ThumbnailLayout>('parts-plus');
  const [outOfPhotos, setOutOfPhotos] = useState(false);
  const { allowance: photos } = useAllowance('thumbnails');
  useCreditReturn();
  const [making, setMaking] = useState<{ done: number; total: number; current: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [pushStatus, setPushStatus] = useState<'draft' | 'published'>('draft');
  const [editing, setEditing] = useState<ThumbnailRecord | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const stopRef = useRef(false);
  const revealTopUp = useCallback((node: HTMLDivElement | null) => node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), []);

  useEffect(() => {
    if (user && subscription_status && !THUMBNAIL_TIERS.includes(subscription_status)) router.push('/dashboard/articles');
  }, [user, subscription_status, router]);

  useEffect(() => {
    if (!user) return;
    brandProfileOperations.getAll(user.uid).then((profiles) => {
      setBrands(profiles);
      const saved = localStorage.getItem(BRAND_KEY);
      const initial = profiles.find((b) => b.id === saved) ?? profiles[0];
      if (initial?.id) setBrandId(initial.id);
      else setLoading(false);
    });
  }, [user]);

  const brand = brands.find((b) => b.id === brandId);

  useEffect(() => {
    setLogoUrl(brand?.thumbnailLogoPath ? `/api/thumbnails/asset?path=${encodeURIComponent(brand.thumbnailLogoPath)}` : null);
  }, [brand?.thumbnailLogoPath]);

  const load = useCallback(async () => {
    if (!user || !brandId) return;
    setLoading(true);
    try {
      const [list, articles] = await Promise.all([
        thumbnailApi<{ thumbnails: ThumbnailRecord[] }>(user, `/api/thumbnails?brandId=${encodeURIComponent(brandId)}`),
        thumbnailApi<{ articles: StudioArticle[] }>(user, `/api/thumbnails/articles?brandId=${encodeURIComponent(brandId)}`),
      ]);
      setThumbnails(list.thumbnails);
      setAppArticles(articles.articles);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load thumbnails');
    } finally {
      setLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    if (!brandId) return;
    localStorage.setItem(BRAND_KEY, brandId);
    setPicked(new Set());
    setSelected(new Set());
    setShopifyArticles([]);
    setShopifyState('idle');
    load();
  }, [brandId, load]);

  const loadShopify = useCallback(async () => {
    if (!user || !brand?.shopifyStoreUrl) return setShopifyState('unavailable');
    setShopifyState('loading');
    try {
      const { articles } = await thumbnailApi<{ articles: ShopifyArticle[] }>(user, '/api/shopify/get-articles', {
        method: 'POST',
        body: JSON.stringify({ brandId }),
      });
      setShopifyArticles(articles ?? []);
      setShopifyState('ready');
    } catch {
      setShopifyState('unavailable');
    }
  }, [user, brand?.shopifyStoreUrl, brandId]);

  useEffect(() => {
    if (brand && shopifyState === 'idle') loadShopify();
  }, [brand, shopifyState, loadShopify]);

  const linkOptions: LinkOption[] = useMemo(
    () => [
      ...appArticles.map((article) => {
        const target: ThumbnailTarget = { kind: 'blog', blogId: article.id };
        return { value: targetValue(target), label: article.title, group: 'app' as const, target };
      }),
      ...shopifyArticles.map((article) => {
        const target: ThumbnailTarget = { kind: 'shopify', articleId: String(article.id), shopifyBlogId: String(article.blog_id) };
        return { value: targetValue(target), label: article.title, group: 'shopify' as const, target };
      }),
    ],
    [appArticles, shopifyArticles],
  );
  const linkLabel = (target: ThumbnailTarget | null) => {
    if (!target) return null;
    const option = linkOptions.find((o) => o.value === targetValue(target));
    return option ? `${option.group === 'app' ? 'Article' : 'Shopify'}: ${option.label}` : target.kind === 'blog' ? 'Linked article' : 'Shopify article';
  };

  const linkedValues = useMemo(() => new Set(thumbnails.map((t) => targetValue(t.target)).filter(Boolean)), [thumbnails]);

  const sources: Source[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list: Source[] =
      tab === 'app'
        ? appArticles.map((a) => {
            const target: ThumbnailTarget = { kind: 'blog', blogId: a.id };
            return { value: targetValue(target), title: a.title, keyword: a.keyword, target, hasImage: Boolean(a.thumbnailId) || linkedValues.has(targetValue(target)) };
          })
        : shopifyArticles.map((a) => {
            const target: ThumbnailTarget = { kind: 'shopify', articleId: String(a.id), shopifyBlogId: String(a.blog_id) };
            return { value: targetValue(target), title: a.title, keyword: null, target, hasImage: Boolean(a.image?.src) || linkedValues.has(targetValue(target)) };
          });
    return q ? list.filter((s) => s.title.toLowerCase().includes(q)) : list;
  }, [tab, appArticles, shopifyArticles, search, linkedValues]);

  const allSources = useMemo(() => {
    const map = new Map<string, Source>();
    for (const a of appArticles) {
      const target: ThumbnailTarget = { kind: 'blog', blogId: a.id };
      map.set(targetValue(target), { value: targetValue(target), title: a.title, keyword: a.keyword, target, hasImage: false });
    }
    for (const a of shopifyArticles) {
      const target: ThumbnailTarget = { kind: 'shopify', articleId: String(a.id), shopifyBlogId: String(a.blog_id) };
      map.set(targetValue(target), { value: targetValue(target), title: a.title, keyword: null, target, hasImage: false });
    }
    return map;
  }, [appArticles, shopifyArticles]);

  const togglePick = (value: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const make = async () => {
    if (!user || !brandId) return;
    const jobs: { title: string; keyword: string | null; target: ThumbnailTarget | null }[] = [
      ...Array.from(picked)
        .map((value) => allSources.get(value))
        .filter((s): s is Source => Boolean(s))
        .map((s) => ({ title: s.title, keyword: s.keyword, target: s.target })),
      ...(customTitle.trim() ? [{ title: customTitle.trim(), keyword: null, target: null }] : []),
    ];
    if (!jobs.length) return;
    stopRef.current = false;
    let failures = 0;
    for (const [index, job] of jobs.entries()) {
      if (stopRef.current) break;
      setMaking({ done: index, total: jobs.length, current: job.title });
      try {
        const { thumbnail } = await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, '/api/thumbnails', {
          method: 'POST',
          body: JSON.stringify({ brandId, layout, ...job }),
        });
        setThumbnails((current) => [thumbnail, ...current]);
      } catch (error) {
        failures += 1;
        if ((error as { code?: string }).code === 'image_limit') {
          setOutOfPhotos(true);
          toast.error(error instanceof Error ? error.message : 'Out of photos this month');
          break;
        }
        toast.error(`${job.title}: ${error instanceof Error ? error.message : 'failed'}`);
      }
    }
    setMaking(null);
    setPicked(new Set());
    setCustomTitle('');
    announceUsageChange();
    if (jobs.length - failures > 0) toast.success(`${jobs.length - failures} thumbnail${jobs.length - failures === 1 ? '' : 's'} ready`);
  };

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const push = async () => {
    if (!user || !selected.size) return;
    const ids = Array.from(selected);
    const unlinked = thumbnails.filter((t) => selected.has(t.id) && !t.target).length;
    if (unlinked === ids.length) {
      toast.error('Link the selected thumbnails to articles first');
      return;
    }
    setPushing(new Set(ids));
    try {
      const { results } = await thumbnailApi<{ results: { id: string; ok: boolean; message: string }[] }>(user, '/api/thumbnails/push', {
        method: 'POST',
        body: JSON.stringify({ ids, status: pushStatus }),
      });
      const ok = results.filter((r) => r.ok).length;
      if (ok) toast.success(`${ok} sent to Shopify`);
      if (ok < results.length) toast.error(`${results.length - ok} could not be sent; see the cards for why`);
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Push failed');
    } finally {
      setPushing(new Set());
    }
  };

  const remove = async () => {
    if (!user || !selected.size) return;
    if (!window.confirm(`Delete ${selected.size} thumbnail${selected.size === 1 ? '' : 's'}? Articles using them lose their featured image here, not in Shopify.`)) return;
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => thumbnailApi(user, `/api/thumbnails/${id}`, { method: 'DELETE' }).catch(() => undefined)));
    setThumbnails((current) => current.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
  };

  const regenerate = async (ids: string[]) => {
    if (!user || !ids.length) return;
    setRegenerating((current) => new Set([...Array.from(current), ...ids]));
    let failed = 0;
    // One at a time: each is a full image generation.
    for (const id of ids) {
      try {
        const { thumbnail } = await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, `/api/thumbnails/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ regenerate: true }),
        });
        setThumbnails((current) => current.map((t) => (t.id === id ? thumbnail : t)));
      } catch (error) {
        failed++;
        if ((error as { code?: string }).code === 'image_limit') {
          setOutOfPhotos(true);
          toast.error(error instanceof Error ? error.message : 'Out of photos this month');
          const skipped = new Set(ids.slice(ids.indexOf(id) + 1));
          setRegenerating((current) => new Set(Array.from(current).filter((other) => !skipped.has(other))));
          return;
        }
      } finally {
        setRegenerating((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
    announceUsageChange();
    if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} could not be remade`);
    else toast.success(ids.length === 1 ? 'New photo ready' : `${ids.length} new photos ready`);
  };

  const onSaved = (saved: ThumbnailRecord) => {
    setThumbnails((current) => current.map((t) => (t.id === saved.id ? saved : t)));
    setEditing(saved);
  };

  if (!user) return null;

  const pickCount = picked.size + (customTitle.trim() ? 1 : 0);
  const allSelected = thumbnails.length > 0 && thumbnails.every((t) => selected.has(t.id));

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Thumbnail studio</h1>
          <p className="mt-1 text-sm text-gray-500">Featured images for your articles: a photo, your brand colour and the title, ready for Shopify.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UsageMeter kind="thumbnails" onTopUp={() => setOutOfPhotos(true)} />
          {brands.length > 0 && (
            <select
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brandName}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {!loading && brands.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="font-medium text-gray-900">Create a brand profile first</p>
          <p className="mt-1 text-sm text-gray-500">Thumbnails use its colour, name and logo.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <section className="flex max-h-[calc(100vh-10rem)] flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-6">
            <div className="border-b border-gray-100 p-4">
              <h2 className="font-semibold text-gray-900">Make thumbnails</h2>
              <div className="mt-3 grid grid-cols-2 rounded-lg bg-gray-100 p-0.5">
                {(['app', 'shopify'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${tab === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {value === 'app' ? `Your articles (${appArticles.length})` : `In Shopify (${shopifyArticles.length})`}
                  </button>
                ))}
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search titles"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <ul className="min-h-[10rem] flex-1 divide-y divide-gray-50 overflow-y-auto">
              {tab === 'shopify' && shopifyState === 'loading' && (
                <li className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </li>
              )}
              {tab === 'shopify' && shopifyState === 'unavailable' && (
                <li className="px-4 py-6 text-center text-sm text-gray-500">Connect this brand&apos;s Shopify store to pick articles already published there.</li>
              )}
              {sources.map((source) => (
                <li key={source.value}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <input type="checkbox" checked={picked.has(source.value)} onChange={() => togglePick(source.value)} className="mt-0.5 rounded text-blue-600" />
                    <span className="min-w-0 flex-1 text-sm leading-snug text-gray-800">{source.title}</span>
                    {source.hasImage && <ImageIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500" aria-label="Has an image" />}
                  </label>
                </li>
              ))}
              {!loading && sources.length === 0 && (tab === 'app' || shopifyState === 'ready') && (
                <li className="px-4 py-6 text-center text-sm text-gray-500">{search ? 'Nothing matches.' : 'No articles yet.'}</li>
              )}
            </ul>

            <div className="space-y-3 border-t border-gray-100 p-4">
              <input
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder="Or type any title"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-600">Style</p>
                <StylePicker
                  value={layout}
                  onChange={setLayout}
                  title={customTitle || sources.find((source) => picked.has(source.value))?.title}
                  color={brand?.brandColor}
                  brand={brand?.brandName}
                  disabled={Boolean(making)}
                />
              </div>
              {making ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="truncate pr-2">Making {making.done + 1} of {making.total}: {making.current}</span>
                    <button type="button" onClick={() => (stopRef.current = true)} className="flex-shrink-0 font-medium text-gray-500 hover:text-red-600">
                      Stop
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${((making.done + 0.5) / making.total) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={make}
                  disabled={!pickCount}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {pickCount ? `Make ${pickCount} thumbnail${pickCount === 1 ? '' : 's'}` : 'Pick articles to illustrate'}
                </button>
              )}
              <p className="text-center text-[11px] text-gray-400">About 30 seconds each. You can edit every one before it goes anywhere.</p>
              {photos && !photos.unlimited && pickCount > photos.left && (
                <p className="text-center text-xs font-medium text-amber-700">
                  {describeAllowance(photos)}. Only the first {photos.left} can be made.
                </p>
              )}
              {outOfPhotos && (
                <div ref={revealTopUp}>
                  <BuyCredits
                    kind="images"
                    compact
                    title={photos && photos.left > 0 ? 'Get more thumbnail photos' : "You've used this month's thumbnail photos"}
                    returnTo="/dashboard/generate-thumbnail"
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">Thumbnails</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{thumbnails.length}</span>
                {thumbnails.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(allSelected ? new Set() : new Set(thumbnails.map((t) => t.id)))}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {allSelected ? 'Clear selection' : 'Select all'}
                  </button>
                )}
              </div>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pushStatus}
                    onChange={(event) => setPushStatus(event.target.value as 'draft' | 'published')}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none"
                    title="For articles not yet in Shopify"
                  >
                    <option value="draft">New articles as drafts</option>
                    <option value="published">New articles published</option>
                  </select>
                  <button
                    type="button"
                    onClick={remove}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-red-300 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => regenerate(Array.from(selected).filter((id) => !regenerating.has(id)))}
                    disabled={pushing.size > 0}
                    title="A new photo for each, keeping your text and layout"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerating.size ? 'animate-spin' : ''}`} /> New photo{selected.size === 1 ? '' : 's'} ({selected.size})
                  </button>
                  <button
                    type="button"
                    onClick={push}
                    disabled={pushing.size > 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
                  >
                    {pushing.size ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
                    Push {selected.size} to Shopify
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : thumbnails.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 font-medium text-gray-900">No thumbnails yet</p>
                <p className="mt-1 text-sm text-gray-500">Pick articles on the left and we&apos;ll make one for each.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 p-0.5">
                {thumbnails.map((thumbnail) => (
                  <ThumbnailCard
                    key={thumbnail.id}
                    thumbnail={thumbnail}
                    linkLabel={linkLabel(thumbnail.target)}
                    selected={selected.has(thumbnail.id)}
                    busy={pushing.has(thumbnail.id) || regenerating.has(thumbnail.id)}
                    onToggle={() => toggleSelected(thumbnail.id)}
                    onRegenerate={() => regenerate([thumbnail.id])}
                    onOpen={() => setEditing(thumbnail)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {editing && (
        <ThumbnailEditor
          user={user}
          thumbnail={editing}
          brandColor={brand?.brandColor}
          logoUrl={logoUrl}
          links={linkOptions}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onLogoUploaded={(url) => {
            setLogoUrl(url);
            const path = new URL(url, window.location.origin).searchParams.get('path') ?? undefined;
            setBrands((current) => current.map((b) => (b.id === brandId ? { ...b, thumbnailLogoPath: path } : b)));
          }}
        />
      )}
    </div>
  );
}
