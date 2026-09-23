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
import { getShopifyConnection, isShopifyAppConfigured } from './oauth';
import { normalizeShopDomain } from './shop';

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
  /**
   * 'oauth' is a token the merchant granted us, 'stored' a legacy permanent token from
   * the brand profile, 'app' one minted just now from the app's own credentials.
   */
  source: 'oauth' | 'stored' | 'app';
}

export { isShopifyAppConfigured } from './oauth';
export { normalizeShopDomain } from './shop';

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

  // A merchant-granted connection wins over everything else. It is the only credential
  // the merchant explicitly approved, and preferring it means a stale token left in the
  // profile's token field cannot shadow a working connection — which is exactly the trap
  // a revoked legacy token creates, since Shopify rejects it on every call.
  const connection = await getShopifyConnection(uid, brandId);
  if (connection) {
    return {
      shopDomain: connection.shopDomain,
      accessToken: connection.accessToken,
      source: 'oauth',
    };
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
      'This store is not connected yet. Open the brand profile and use Connect Shopify.',
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

/**
 * What a route should say when Shopify itself refuses the call.
 *
 * The generic "check your store URL and access token" this replaces was actively
 * misleading: it pointed at a field the user could not fix, and hid both the status code
 * and Shopify's own explanation. A rejected legacy token is called out by name, because
 * it is the one case with a clear remedy and no obvious symptom.
 */
export function shopifyApiError(
  status: number,
  detail: string,
  source: ShopifyCredentials['source']
): { error: string; status: number } {
  const reason = detail.trim().slice(0, 300);

  if (status === 401 || status === 403) {
    if (source === 'stored') {
      return {
        error:
          'Shopify rejected the access token saved on this brand profile. Tokens from ' +
          'admin-created custom apps no longer work — clear that field and use Connect ' +
          `Shopify instead. Shopify said: ${reason}`,
        status: 502,
      };
    }

    return {
      error:
        source === 'oauth'
          ? `Shopify rejected this store connection (${status}). Reconnect the store to approve access again. Shopify said: ${reason}`
          : `Shopify rejected the request (${status}): ${reason}`,
      status: 502,
    };
  }

  return { error: `Shopify returned ${status}: ${reason}`, status: 502 };
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
