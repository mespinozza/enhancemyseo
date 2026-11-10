'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FileText, LayoutGrid, Loader2, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import { thumbnailApi } from '@/lib/thumbnail/client';
import type { StoreOverview } from '@/lib/keywords/collection-types';
import type { ShopifyAccess } from '@/lib/collections/types';
import StoreOverviewPanel from '@/components/keywords/StoreOverviewPanel';
import ArticleKeywords from '@/components/keywords/ArticleKeywords';
import CollectionPlanner from '@/components/collections/CollectionPlanner';

const BRAND_KEY = 'keyword-collections-brand';
const TAB_KEY = 'keyword-collections-tab';

type Tab = 'collections' | 'keywords';
type Request = { focus: string; nonce: number };

export default function KeywordCollectionsPage() {
  const { user, subscription_status } = useAuth();
  const router = useRouter();
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [brandId, setBrandId] = useState('');
  const [access, setAccess] = useState<ShopifyAccess | null>(null);
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tab, setTab] = useState<Tab>('collections');
  const [requests, setRequests] = useState<Record<Tab, Request | null>>({ collections: null, keywords: null });
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    if (user && subscription_status && subscription_status !== 'admin') router.push('/dashboard/articles');
  }, [user, subscription_status, router]);

  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'collections' || saved === 'keywords') setTab(saved);
  }, []);

  useEffect(() => {
    if (!user) return;
    brandProfileOperations.getAll(user.uid).then((profiles) => {
      setBrands(profiles);
      const saved = localStorage.getItem(BRAND_KEY);
      const initial = profiles.find((b) => b.id === saved) ?? profiles.find((b) => b.shopifyStoreUrl) ?? profiles[0];
      if (initial?.id) setBrandId(initial.id);
    });
  }, [user]);

  const brand = brands.find((b) => b.id === brandId);

  useEffect(() => {
    if (!user || !brandId) return;
    localStorage.setItem(BRAND_KEY, brandId);
    let stale = false;
    setAccess(null);
    setOverview(null);
    setChecking(true);
    thumbnailApi<{ access: ShopifyAccess }>(user, `/api/collection-plans/access?brandId=${encodeURIComponent(brandId)}`)
      .then(({ access: result }) => !stale && setAccess(result))
      .catch((error) => {
        if (!stale) setAccess({ connected: false, shopDomain: null, canCreate: false, missingScopes: [], reason: error instanceof Error ? error.message : null });
      })
      .finally(() => !stale && setChecking(false));
    return () => {
      stale = true;
    };
  }, [user, brandId]);

  const connected = Boolean(access?.connected);

  const loadOverview = useCallback(
    async (fresh = false) => {
      if (!user || !brandId || !connected) return;
      setOverviewLoading(true);
      setOverviewError(null);
      if (fresh) setOverview(null);
      try {
        const { overview: data } = await thumbnailApi<{ overview: StoreOverview }>(
          user,
          `/api/keyword-collections/store?brandId=${encodeURIComponent(brandId)}${fresh ? '&fresh=1' : ''}`,
        );
        setOverview(data);
      } catch (error) {
        setOverviewError(error instanceof Error ? error.message : 'Could not read the store');
      } finally {
        setOverviewLoading(false);
      }
    },
    [user, brandId, connected],
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const pickTab = (next: Tab) => {
    setTab(next);
    localStorage.setItem(TAB_KEY, next);
  };

  const connect = async () => {
    if (!user || !brandId) return;
    setConnecting(true);
    try {
      const { url } = await thumbnailApi<{ url: string }>(user, '/api/shopify/connect', {
        method: 'POST',
        body: JSON.stringify({ brandId, returnTo: '/dashboard/collections' }),
      });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the connection');
      setConnecting(false);
    }
  };

  if (!user) return null;

  const locked = !connected;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Keyword collections</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Built from your Shopify catalogue: new long-tail collection pages that put your products in front of more searches, and article
            keywords that link back to them.
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

      {brands.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Add a brand profile with its Shopify store first.{' '}
          <Link href="/dashboard/settings/brands" className="font-medium text-blue-600 hover:text-blue-800">
            Brand profiles
          </Link>
        </div>
      )}

      {brand && checking && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking {brand.brandName}&apos;s Shopify connection…
        </div>
      )}

      {brand && !checking && access && !access.connected && (
        <div className="mt-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShoppingBag className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">{brand.brandName} is not connected to Shopify, so nothing can be generated</p>
                <p className="mt-1 max-w-2xl text-sm text-amber-800">
                  Collections and keywords here are built only from a real Shopify catalogue: its products, vendors, collections and blog. Connect the
                  store and everything below unlocks.
                </p>
                {access.reason && <p className="mt-2 text-xs text-amber-700">Shopify said: {access.reason}</p>}
              </div>
            </div>
            {brand.shopifyStoreUrl ? (
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {connecting && <Loader2 className="h-4 w-4 animate-spin" />} Connect Shopify
              </button>
            ) : (
              <Link href="/dashboard/settings/brands" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                Add the store to this brand
              </Link>
            )}
          </div>
        </div>
      )}

      {brand && connected && (
        <StoreOverviewPanel
          key={brandId}
          brandName={brand.brandName}
          overview={overview}
          loading={overviewLoading}
          error={overviewError}
          building={false}
          actionLabel={tab === 'collections' ? 'Plan collections' : 'Build keywords'}
          onBuild={(focus) => {
            setRequests((current) => ({ ...current, [tab]: { focus, nonce: Date.now() } }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onRefresh={() => loadOverview(true)}
        />
      )}

      {brand && (
        <>
          <div className="mt-6 flex gap-1 border-b border-gray-200">
            {(
              [
                { id: 'collections', label: 'Shopify collections', icon: LayoutGrid },
                { id: 'keywords', label: 'Article keywords', icon: FileText },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => pickTab(id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <div className={`mt-5 ${locked && !checking ? 'opacity-60' : ''}`}>
            {tab === 'collections' ? (
              <CollectionPlanner
                key={brandId}
                user={user}
                brandId={brandId}
                brandName={brand.brandName}
                access={access}
                locked={locked}
                request={requests.collections}
                onRequestTaken={() => setRequests((current) => ({ ...current, collections: null }))}
                onReconnect={connect}
              />
            ) : (
              <ArticleKeywords
                key={brandId}
                user={user}
                brandId={brandId}
                locked={locked}
                request={requests.keywords}
                onRequestTaken={() => setRequests((current) => ({ ...current, keywords: null }))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
