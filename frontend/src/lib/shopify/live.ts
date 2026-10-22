/**
 * Which Shopify resources a shopper can actually open.
 *
 * The Admin API returns draft, archived and unlisted products alongside live ones, and
 * unpublished pages alongside published ones. A link to any of those is a 404 on the
 * storefront, so nothing that writes or checks article links should treat them as real.
 */

/** Add to a product node selection so `isLiveProduct` has what it needs. */
export const LIVE_PRODUCT_FIELDS = 'status onlineStoreUrl';

/** Add to a page node selection so `isLivePage` has what it needs. */
export const LIVE_PAGE_FIELDS = 'isPublished';

/**
 * Narrows a product search to active products, so drafts do not take up result slots.
 * Only a pre-filter: `isLiveProduct` still decides, because an active product can be
 * missing from the Online Store.
 */
export function activeProductsOnly(searchQuery: string): string {
  const trimmed = searchQuery.trim();
  return trimmed ? `${trimmed} AND status:active` : 'status:active';
}

/** Active, and published to the Online Store (`onlineStoreUrl` is null otherwise). */
export function isLiveProduct(
  product: { status?: unknown; onlineStoreUrl?: unknown; [key: string]: unknown } | null | undefined
): boolean {
  return (
    product?.status === 'ACTIVE' &&
    typeof product.onlineStoreUrl === 'string' &&
    product.onlineStoreUrl.length > 0
  );
}

export function isLivePage(
  page: { isPublished?: unknown; [key: string]: unknown } | null | undefined
): boolean {
  return page?.isPublished === true;
}
