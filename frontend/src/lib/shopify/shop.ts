/**
 * Store domain handling.
 *
 * Separate from `credentials.ts` and `oauth.ts` because both of those need it, and
 * importing it from either would make them circular. Deliberately free of environment
 * reads and server imports, so the browser can use it too.
 */

/**
 * Accepts whatever a user pasted — `https://shop.myshopify.com/`, `shop`, or the host on
 * its own — and returns the host Shopify's API expects.
 */
export function normalizeShopDomain(storeUrl: string): string {
  let domain = (storeUrl || '').trim();
  if (!domain) return '';

  if (domain.includes('://')) domain = domain.split('://')[1];
  domain = domain.split('/')[0].trim();
  while (domain.endsWith('/')) domain = domain.slice(0, -1);
  if (domain && !domain.includes('.')) domain = `${domain}.myshopify.com`;

  return domain.toLowerCase();
}

/**
 * Whether a domain is one Shopify itself issued.
 *
 * The OAuth flow redirects the browser to this host and later posts the app's client
 * secret to it, so an arbitrary host here would be a way to harvest the secret. Custom
 * storefront domains are deliberately rejected: the Admin API only answers on the
 * myshopify host anyway.
 */
export function isValidShopDomain(shopDomain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain);
}
