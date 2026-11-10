import type { ThumbnailLayout } from './design';

export interface TutorialThumbnailArticle {
  blogId: string;
  brandId: string;
  title: string;
  keyword?: string | null;
  brandName?: string;
  brandColor?: string;
  /** The style picked on the offer, used when the thumbnail is made after upgrading. */
  layout?: ThumbnailLayout;
  /** What the article contains, shown back to the writer on the offer. */
  stats?: ArticleStats;
}

export interface ArticleStats {
  words: number;
  sections: number;
  /** Links to the brand's own pages: products, collections and the like. */
  ownLinks: number;
}

/** Counts read from the article's HTML; links count as the brand's own by host or path. */
export function articleStats(html: string, siteUrls: (string | null | undefined)[]): ArticleStats {
  const hosts = siteUrls
    .map((url) => (url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase())
    .filter(Boolean);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const words = text.split(/\s+/).filter((w) => /\w/.test(w)).length;
  const sections = (html.match(/<h2[\s>]/gi) || []).length;
  const hrefs = Array.from(html.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi), (m) => m[1].toLowerCase());
  const ownLinks = new Set(
    hrefs.filter((href) => href.startsWith('/') || hosts.some((host) => href.includes(host)) || /\/(products|collections|pages)\//.test(href)),
  ).size;
  return { words, sections, ownLinks };
}

const PENDING_KEY = 'tutorial-thumbnail:pending';

/** The tutorial article a free account was offered a thumbnail for, kept until they upgrade or decline. */
export function pendingTutorialThumbnail(): TutorialThumbnailArticle | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as TutorialThumbnailArticle) : null;
  } catch {
    return null;
  }
}

export const savePendingTutorialThumbnail = (article: TutorialThumbnailArticle) =>
  localStorage.setItem(PENDING_KEY, JSON.stringify(article));

export const clearPendingTutorialThumbnail = () => localStorage.removeItem(PENDING_KEY);
