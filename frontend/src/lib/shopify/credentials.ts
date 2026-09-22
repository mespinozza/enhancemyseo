/**
 * Working out which Shopify credentials to call the Admin API with.
 *
 * Server-only. There are two kinds of store in play and they are authenticated
 * differently:
 *
 *   - Stores with a legacy admin-created custom app have a permanent `shpat_` token
 *     saved on the brand profile. Shopify stopped letting merchants create these, so no
 *     new store can get one, but existing ones keep working and must keep working.
 *   - Everything else is reached with the client credentials grant: the Dev Dashboard
 *     app's ID and secret are exchanged for a token that lives 24 hours. Nothing is
 *     stored, because a token that expires daily is not worth persisting.
 *
 * Callers pass a brandId and the credentials are resolved here, server-side, rather than
 * being sent up from the browser. A minted token could not come from the browser anyway,
 * and it keeps long-lived store tokens out of a document the client can read.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { QUOTA_EXHAUSTED_MESSAGE, isQuotaExhausted } from '@/lib/firebase/quota';

const TOKEN_PATH = '/admin/oauth/access_token';

/** Failure a user can act on: wrong store, missing scopes, app not installed. */
export class ShopifyCredentialError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ShopifyCredentialError';
    this.status = status;
  }
}

export interface ShopifyCredentials {
  /** Always a bare `*.myshopify.com` host, never a scheme or trailing slash. */
  shopDomain: string;
  accessToken: string;
  /** 'stored' is a legacy permanent token; 'app' was minted just now. */
  source: 'stored' | 'app';
}

export function isShopifyAppConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

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

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Minted tokens are cached per store for the life of the process. Railway runs this as a
 * long-lived Node process, so an automation writing ten articles reuses one token instead
 * of asking Shopify for ten.
 */
const tokenCache = new Map<string, CachedToken>();

/** A minute of headroom, so a token cannot expire between the check and the call. */
const EXPIRY_MARGIN_MS = 60_000;

async function mintAppToken(shopDomain: string): Promise<string> {
  const cached = tokenCache.get(shopDomain);
  if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.token;
  }

  const response = await fetch(`https://${shopDomain}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID as string,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET as string,
    }).toString(),
  });

  const detail = await response.text();

  if (!response.ok) {
    // The one failure worth explaining, because it is a configuration mistake rather
    // than a bug: the grant only reaches stores in the app's own organization.
    if (detail.includes('shop_not_permitted')) {
      throw new ShopifyCredentialError(
        `${shopDomain} is not in the same Shopify organization as this app, so a token cannot be issued for it. ` +
          'Add the store to the organization, or install a custom-distribution app on it.',
        403
      );
    }

    throw new ShopifyCredentialError(
      `Shopify would not issue an access token for ${shopDomain} (${response.status}): ${detail.slice(0, 200)}`,
      502
    );
  }

  const payload = JSON.parse(detail) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new ShopifyCredentialError('Shopify returned no access token', 502);
  }

  tokenCache.set(shopDomain, {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 86_399) * 1000,
  });

  return payload.access_token;
}

/** Drops a cached token, so the next call mints a fresh one. */
export function forgetShopifyToken(shopDomain: string): void {
  tokenCache.delete(normalizeShopDomain(shopDomain));
}

interface BrandShopifyFields {
  userId?: string;
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
}

/** Credentials for a brand the caller owns. Ownership is checked, never assumed. */
export async function shopifyCredentialsForBrand(
  uid: string,
  brandId: string
): Promise<ShopifyCredentials> {
  initializeFirebaseAdmin();
  const snapshot = await getFirestore().collection('brandProfiles').doc(brandId).get();

  if (!snapshot.exists) {
    throw new ShopifyCredentialError('That brand profile no longer exists', 404);
  }

  const brand = snapshot.data() as BrandShopifyFields;
  if (brand.userId !== uid) {
    throw new ShopifyCredentialError('That brand profile belongs to another account', 403);
  }

  const shopDomain = normalizeShopDomain(brand.shopifyStoreUrl || '');
  if (!shopDomain) {
    throw new ShopifyCredentialError('This brand profile has no Shopify store URL saved');
  }

  const storedToken = brand.shopifyAccessToken?.trim();
  if (storedToken) {
    return { shopDomain, accessToken: storedToken, source: 'stored' };
  }

  if (!isShopifyAppConfigured()) {
    throw new ShopifyCredentialError(
      'This brand has no Shopify access token, and the deployment has no Shopify app credentials to mint one with.',
      503
    );
  }

  return { shopDomain, accessToken: await mintAppToken(shopDomain), source: 'app' };
}

export interface ShopifyCredentialInput {
  brandId?: string;
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
}

/**
 * What API routes call. A brandId resolves server-side and is the path everything should
 * be on; a store URL and token in the body are still honoured so that a client which has
 * not been updated keeps working.
 */
export async function resolveShopifyCredentials(
  uid: string,
  input: ShopifyCredentialInput
): Promise<ShopifyCredentials> {
  if (input.brandId) {
    return shopifyCredentialsForBrand(uid, input.brandId);
  }

  const shopDomain = normalizeShopDomain(input.shopifyStoreUrl || '');
  if (!shopDomain) {
    throw new ShopifyCredentialError('Missing required field: brandId or shopifyStoreUrl');
  }

  const bodyToken = input.shopifyAccessToken?.trim();
  if (bodyToken) {
    return { shopDomain, accessToken: bodyToken, source: 'stored' };
  }

  if (!isShopifyAppConfigured()) {
    throw new ShopifyCredentialError('Missing required field: shopifyAccessToken');
  }

  return { shopDomain, accessToken: await mintAppToken(shopDomain), source: 'app' };
}

/** Turns a credential failure into the response a route should send. */
export function shopifyCredentialResponse(error: unknown): { error: string; status: number } {
  if (error instanceof ShopifyCredentialError) {
    return { error: error.message, status: error.status };
  }
  // Reading the brand profile is the first thing that happens here, so a project-wide
  // database stop looks like a Shopify failure unless it is named.
  if (isQuotaExhausted(error)) {
    return { error: QUOTA_EXHAUSTED_MESSAGE, status: 503 };
  }
  return {
    error: error instanceof Error ? error.message : 'Could not reach Shopify',
    status: 500,
  };
}
