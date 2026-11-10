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
