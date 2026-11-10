'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { ArticleSeo } from '@/lib/article/enhanced/types';
import { handleFromTitle, readingMinutes, storefrontBody } from '@/lib/article/storefront';
import { sanitizeArticleHtml } from '@/lib/article/sanitize';

interface StorefrontPreviewProps {
  title: string;
  html: string;
  seo?: ArticleSeo;
  /** Store or site address, shown in the address bar. */
  domain?: string;
  author?: string;
  date?: Date;
}

/** Images that fail to load are hidden, as a theme's lazy loader would leave them out. */
function withSafeImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/\/?>$/, ' loading="lazy" onerror="this.style.display=\'none\'" style="max-width:100%;height:auto">')
  );
}

function hostOf(domain?: string): string {
  if (!domain) return 'your-store.com';
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'your-store.com';
}

/**
 * The article laid out like a published blog post on a Shopify theme: the theme prints
 * the featured image, title and date, then the body in a narrow reading column.
 */
export default function StorefrontPreview({ title, html, seo, domain, author, date = new Date() }: StorefrontPreviewProps) {
  const body = useMemo(() => withSafeImages(sanitizeArticleHtml(storefrontBody(html))), [html]);
  const minutes = useMemo(() => readingMinutes(html), [html]);
  const image = seo?.featuredImage?.src;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs text-gray-500 ring-1 ring-gray-200">
          <Lock className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {hostOf(domain)}/blogs/news/{handleFromTitle(title)}
          </span>
        </div>
      </div>

      <article className="px-5 pb-10 pt-8 sm:px-10">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- any store's CDN, not a configured Next image host
          <img
            src={image}
            alt={seo?.featuredImage?.alt || ''}
            className="mx-auto mb-8 aspect-[16/9] w-full max-w-3xl rounded-md object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        <header className="mx-auto mb-8 max-w-[42rem] text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-gray-500">
            {date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-tight text-gray-900 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-gray-500">
            {author ? `By ${author} · ` : ''}
            {minutes} min read
          </p>
        </header>

        <div
          className="storefront-article mx-auto max-w-[42rem]"
          dangerouslySetInnerHTML={{ __html: body }}
        />

        {seo?.tags && seo.tags.length > 0 && (
          <div className="mx-auto mt-10 flex max-w-[42rem] flex-wrap gap-2 border-t border-gray-100 pt-6">
            {seo.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
