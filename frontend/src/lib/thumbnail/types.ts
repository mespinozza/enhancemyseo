import type { ThumbnailDesign } from './design';

export const THUMBNAILS_COLLECTION = 'thumbnails';

/** Plans with the Thumbnail studio and automation thumbnails. */
export const THUMBNAIL_TIERS: readonly string[] = ['kickstart', 'seo_takeover', 'agency', 'admin'];

/** What a thumbnail illustrates: an article in this app, or one already in Shopify. */
export type ThumbnailTarget =
  | { kind: 'blog'; blogId: string }
  | { kind: 'shopify'; articleId: string; shopifyBlogId: string };

export type ThumbnailStatus = 'draft' | 'linked' | 'pushed';

/** A thumbnail as the API returns it. */
export interface ThumbnailRecord {
  id: string;
  brandId: string;
  title: string;
  keyword: string | null;
  target: ThumbnailTarget | null;
  design: ThumbnailDesign;
  /** The brand logo it was drawn with, to tell when the brand's logo has changed since. */
  logoPath: string | null;
  /** Full-size public image. Null while the thumbnail is locked. */
  imageUrl: string | null;
  /** Same-origin preview, always available to the owner. */
  previewUrl: string;
  /** Same-origin photo for the editor canvas. Null while locked. */
  photoUrl: string | null;
  status: ThumbnailStatus;
  /** Made by the tutorial for an account without the plan for thumbnails. */
  locked: boolean;
  shopifyAdminUrl: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
