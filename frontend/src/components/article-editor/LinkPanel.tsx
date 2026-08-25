'use client';

import { useMemo, useState } from 'react';
import { Link2, AlertTriangle, CheckCircle2, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ArticleBlock } from '@/lib/article/blocks';
import {
  extractShopifyLinks,
  buildResourceUrl,
  originOfHref,
  type ArticleLink,
  type LinkKind,
} from '@/lib/article/links';

interface BrandConnection {
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
  websiteUrl?: string;
}

interface LinkPanelProps {
  blocks: ArticleBlock[];
  brand: BrandConnection | null;
  getToken: () => Promise<string | null>;
  onSwap: (link: ArticleLink, href: string, anchorText?: string) => void;
  onFocusBlock: (blockId: string) => void;
}

interface Candidate {
  id: string;
  title: string;
  handle: string;
}

const KIND_LABEL: Record<LinkKind, string> = {
  product: 'Product',
  collection: 'Collection',
  page: 'Page',
  other: 'Link',
};

const SEARCH_ENDPOINT: Partial<Record<LinkKind, string>> = {
  product: '/api/content-search/products',
  collection: '/api/content-search/collections',
  page: '/api/content-search/pages',
};

export default function LinkPanel({
  blocks,
  brand,
  getToken,
  onSwap,
  onFocusBlock,
}: LinkPanelProps) {
  const links = useMemo(() => extractShopifyLinks(blocks), [blocks]);

  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [active, setActive] = useState<ArticleLink | null>(null);

  const hasConnection = Boolean(brand?.shopifyStoreUrl && brand?.shopifyAccessToken);

  const validate = async () => {
    if (!hasConnection) {
      toast.error('This brand has no Shopify connection configured.');
      return;
    }

    setIsValidating(true);
    try {
      const token = await getToken();
      const response = await fetch('/api/article/validate-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          shopifyStoreUrl: brand?.shopifyStoreUrl,
          shopifyAccessToken: brand?.shopifyAccessToken,
          links: links.map((link) => ({ kind: link.kind, handle: link.handle })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not verify links.');

      const next: Record<string, boolean> = {};
      for (const resource of payload.resources ?? []) {
        next[`${resource.kind}:${resource.handle}`] = Boolean(resource.exists);
      }
      setValidity(next);

      const broken = Object.values(next).filter((exists) => !exists).length;
      toast.success(
        broken === 0
          ? 'All linked resources still exist in the store.'
          : `${broken} link${broken === 1 ? '' : 's'} no longer resolve in the store.`,
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not verify links.');
    } finally {
      setIsValidating(false);
    }
  };

  if (links.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <Link2 className="mx-auto mb-2 text-gray-300" size={24} />
        <p className="text-sm text-gray-500">
          No Shopify product, collection, or page links found in this article.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500">
          {links.length} linked {links.length === 1 ? 'resource' : 'resources'}
        </p>
        <button
          type="button"
          onClick={validate}
          disabled={isValidating || !hasConnection}
          className="flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {isValidating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Check links
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {links.map((link) => {
          const key = `${link.kind}:${link.handle}`;
          const state = validity[key];

          return (
            <div key={`${link.blockId}-${link.occurrence}`} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {KIND_LABEL[link.kind]}
                </span>
                {state === false && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600">
                    <AlertTriangle size={11} />
                    Not found
                  </span>
                )}
                {state === true && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600">
                    <CheckCircle2 size={11} />
                    Verified
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-gray-900 break-words">{link.anchorText}</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-gray-500">{link.handle}</p>

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActive(link)}
                  disabled={!hasConnection}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                >
                  Change target
                </button>
                <button
                  type="button"
                  onClick={() => onFocusBlock(link.blockId)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Show in article
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <LinkPicker
          link={active}
          brand={brand}
          getToken={getToken}
          onClose={() => setActive(null)}
          onChoose={(candidate, updateText) => {
            const base =
              originOfHref(active.href) ??
              brand?.websiteUrl?.replace(/\/+$/, '') ??
              brand?.shopifyStoreUrl?.replace(/\/+$/, '') ??
              '';
            const href = buildResourceUrl(base, active.kind, candidate.handle);
            onSwap(active, href, updateText ? candidate.title : undefined);
            setActive(null);
          }}
        />
      )}
    </div>
  );
}

interface LinkPickerProps {
  link: ArticleLink;
  brand: BrandConnection | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onChoose: (candidate: Candidate, updateAnchorText: boolean) => void;
}

function LinkPicker({ link, brand, getToken, onClose, onChoose }: LinkPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [updateAnchorText, setUpdateAnchorText] = useState(false);

  const search = async () => {
    const endpoint = SEARCH_ENDPOINT[link.kind];
    if (!endpoint || !term.trim()) return;

    setIsSearching(true);
    try {
      const token = await getToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          shopifyStoreUrl: brand?.shopifyStoreUrl,
          shopifyAccessToken: brand?.shopifyAccessToken,
          searchTerm: term.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Search failed.');

      const items: Candidate[] =
        payload.products ?? payload.collections ?? payload.pages ?? [];
      setResults(items);
      setSearched(true);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Change {KIND_LABEL[link.kind].toLowerCase()} target
            </h3>
            <p className="text-xs text-gray-500">
              Currently linked to <span className="font-mono">{link.handle}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-gray-200 px-5 py-3">
          <div className="flex gap-2">
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  search();
                }
              }}
              placeholder={`Search ${KIND_LABEL[link.kind].toLowerCase()}s by title`}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={search}
              disabled={isSearching || !term.trim()}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Search
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={updateAnchorText}
              onChange={(event) => setUpdateAnchorText(event.target.checked)}
              className="rounded border-gray-300"
            />
            Also replace the link text with the new title
          </label>
          {updateAnchorText && (
            <p className="mt-1 text-[11px] text-amber-600">
              Replacing link text can break the surrounding sentence &mdash; re-read the paragraph after applying.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              {searched ? 'No matches found.' : 'Search to find a replacement.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(candidate, updateAnchorText)}
                    className="w-full px-5 py-3 text-left hover:bg-blue-50"
                  >
                    <p className="text-sm font-medium text-gray-900">{candidate.title}</p>
                    <p className="font-mono text-[11px] text-gray-500">{candidate.handle}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
