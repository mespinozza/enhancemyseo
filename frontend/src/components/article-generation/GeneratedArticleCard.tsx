'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Check, ChevronRight, Copy, Download, Eye, FileText, Loader2, Pencil, ScrollText } from 'lucide-react';
import type { ArticleSeo } from '@/lib/article/enhanced/types';
import { readingMinutes, storefrontBody } from '@/lib/article/storefront';

export type ArticleLayout = 'grid' | 'list';

export interface ArticleSummary {
  id: string;
  title: string;
  content: string;
  createdAt: Date | { toDate?: () => Date };
  seo?: ArticleSeo;
  generationLog?: string[];
}

interface Props {
  article: ArticleSummary;
  layout: ArticleLayout;
  /** Admins can copy the generation log. */
  showLog: boolean;
  /** Its thumbnail is being made. */
  makingThumbnail?: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onCopyLog: () => void;
}

function createdDate(createdAt: ArticleSummary['createdAt']): string {
  const date = createdAt instanceof Date ? createdAt : createdAt?.toDate?.();
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function excerptOf(article: ArticleSummary): string {
  if (article.seo?.excerpt) return article.seo.excerpt;
  return storefrontBody(article.content)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function Action({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {children}
    </button>
  );
}

/** A finished article in the results panel, as a card or a row. Clicking it opens the preview. */
export default function GeneratedArticleCard({
  article,
  layout,
  showLog,
  makingThumbnail = false,
  onOpen,
  onEdit,
  onCopy,
  onDownload,
  onCopyLog,
}: Props) {
  const date = createdDate(article.createdAt);
  const minutes = readingMinutes(article.content);
  const meta = [date, `${minutes} min read`].filter(Boolean).join(' · ');

  const actions = (
    <div className="flex items-center gap-0.5">
      <Action label="Edit article" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Action>
      <Action label="Copy HTML" onClick={onCopy}>
        <Copy className="h-4 w-4" />
      </Action>
      <Action label="Download HTML" onClick={onDownload}>
        <Download className="h-4 w-4" />
      </Action>
      {showLog && article.generationLog && (
        <Action label="Copy generation log" onClick={onCopyLog}>
          <ScrollText className="h-4 w-4" />
        </Action>
      )}
    </div>
  );

  const status = makingThumbnail ? (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
      <Loader2 className="h-3 w-3 animate-spin" /> Making thumbnail
    </span>
  ) : (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-inset ring-green-200">
      <Check className="h-3 w-3" strokeWidth={3} /> Ready
    </span>
  );

  const image = article.seo?.featuredImage?.src;
  const icon = image ? (
    // eslint-disable-next-line @next/next/no-img-element -- a public Storage URL, shown small
    <img
      src={image}
      alt={article.seo?.featuredImage?.alt || ''}
      className="h-9 w-16 flex-shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/5"
    />
  ) : (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
      <FileText className="h-4 w-4" />
    </span>
  );

  if (layout === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
        className="group flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-4"
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900" title={article.title}>
            {article.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{meta}</p>
        </div>
        <span className="hidden sm:inline-flex">{status}</span>
        <div className="hidden md:block">{actions}</div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className="group flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-2">
        {icon}
        {status}
      </div>
      <h4 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-gray-900" title={article.title}>
        {article.title}
      </h4>
      <p className="mt-1 text-xs text-gray-500">{meta}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">{excerptOf(article)}</p>
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
          <Eye className="h-3.5 w-3.5" /> Preview
        </span>
        {actions}
      </div>
    </div>
  );
}
