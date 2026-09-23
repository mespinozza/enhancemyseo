/**
 * Connecting a Shopify store by merchant authorization (the authorization code grant).
 *
 * This is the only way to reach a store that is not in our own Shopify organization, so
 * it is what customers will use. It replaces the retired flow where a merchant created a
 * custom app in their admin and pasted a permanent `shpat_` token into our form:
 * Shopify no longer issues those, and a Dev Dashboard app has no token to copy.
 *
 * Server-only. Tokens live in their own `shopifyConnections` collection, never on the
 * brand profile, because the browser can read a brand profile and a store access token
 * can read and write a merchant's whole catalogue and blog.
 */
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { createStateCodec } from '@/lib/oauth/state';
import { isValidShopDomain } from './shop';

export const SHOPIFY_CONNECTIONS_COLLECTION = 'shopifyConnections';

/**
 * What the app actually calls, and nothing more.
 *
 * `read_products` covers products and collections, which articles link to.
 * `write_content` covers blogs, articles, and pages: reading them to link to, creating
 * articles when pushing, and setting an article's image from the thumbnail tool. It
 * implies read access, so no separate `read_content` is requested.
 *
 * Widening this later forces every connected merchant to re-authorize, so it is worth
 * keeping honest rather than asking for everything up front.
 */
export const SHOPIFY_SCOPES = 'read_products,write_content';

const TOKEN_PATH = '/admin/oauth/access_token';

/** Shopify's own signature covers the callback, so this only needs to be fresh. */
const MAX_CALLBACK_AGE_SECONDS = 5 * 60;

export interface ShopifyConnection {
  /**
   * Deliberately NOT named `userId`. `firestore.rules` has a generic
   * `match /{collection}/{document}` rule granting a client full access to any document
   * whose `userId` matches the caller, which would hand the browser a store access
   * token. A different field name means no client rule can match, and the explicit block
   * in the rules file denies this collection outright as well.
   */
  ownerUid: string;
  brandId: string;
  shopDomain: string;
  accessToken: string;
  /** What the merchant actually granted, which can be narrower than SHOPIFY_SCOPES. */
  scope: string;
  connectedAt: Timestamp;
  /**
   * Offline tokens are non-expiring today. Shopify requires public apps to move to
   * expiring ones by January 2027, so the field is recorded when present rather than
   * assumed absent.
   */
  expiresAt?: Timestamp | null;
}

function adminDb(): Firestore {
  initializeFirebaseAdmin();
  return getFirestore();
}

/** Whether this deployment can run the flow at all. Server-side only: these are secrets. */
export function isShopifyAppConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

function clientSecret(): string {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    throw new Error('SHOPIFY_CLIENT_SECRET is not set on this deployment');
  }
  return secret;
}

const codec = createStateCodec(clientSecret);
export const signState = codec.signState;
export const verifyState = codec.verifyState;

/**
 * Must be registered as an allowed redirect URL on the app in the Dev Dashboard, and must
 * match byte for byte between the authorize request and the token exchange. An explicit
 * env var wins so a deployment behind a proxy cannot guess wrong.
 */
export function redirectUri(request?: Request): string {
  if (process.env.SHOPIFY_OAUTH_REDIRECT_URI) {
    return process.env.SHOPIFY_OAUTH_REDIRECT_URI;
  }

  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const host = forwardedHost || request.headers.get('host');
    if (host) {
      const protocol = forwardedProto || (host.startsWith('localhost') ? 'http' : 'https');
      return `${protocol}://${host}/api/shopify/callback`;
    }
    return `${new URL(request.url).origin}/api/shopify/callback`;
  }

  throw new Error('SHOPIFY_OAUTH_REDIRECT_URI is not set and no request was supplied');
}

/** Where the merchant is sent to approve the scopes. */
export function buildInstallUrl(shopDomain: string, state: string, request: Request): string {
  if (!isValidShopDomain(shopDomain)) {
    throw new Error(`${shopDomain} is not a myshopify.com store domain`);
  }

  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_CLIENT_ID as string,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri(request),
    state,
    // Omitting grant_options[] asks for an offline token, which is what a background
    // automation needs: a per-user token dies with the merchant's browser session.
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Whether the callback really came from Shopify.
 *
 * The signature is computed over the query string with `hmac` removed and the remaining
 * parameters sorted. The raw pieces are reused verbatim rather than re-encoded through
 * URLSearchParams, because re-encoding can change escaping and silently break the
 * comparison for values that contain reserved characters.
 */
export function verifyCallbackSignature(url: URL): boolean {
  const provided = url.searchParams.get('hmac');
  if (!provided) return false;

  const message = url.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => {
      const key = pair.split('=')[0];
      return key !== 'hmac' && key !== 'signature';
    })
    .sort()
    .join('&');

  const expected = createHmac('sha256', clientSecret()).update(message).digest('hex');
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/** Rejects a callback that is authentic but old enough to have been captured and replayed. */
export function isCallbackFresh(url: URL): boolean {
  const timestamp = Number(url.searchParams.get('timestamp'));
  if (!Number.isFinite(timestamp)) return false;
  return Math.abs(Date.now() / 1000 - timestamp) <= MAX_CALLBACK_AGE_SECONDS;
}

export interface ExchangedToken {
  accessToken: string;
  scope: string;
  expiresInSeconds?: number;
}

export async function exchangeCodeForToken(
  shopDomain: string,
  code: string
): Promise<ExchangedToken> {
  if (!isValidShopDomain(shopDomain)) {
    throw new Error(`${shopDomain} is not a myshopify.com store domain`);
  }

  const response = await fetch(`https://${shopDomain}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: clientSecret(),
      code,
    }),
  });

  const detail = await response.text();
  if (!response.ok) {
    throw new Error(
      `Shopify would not exchange the authorization code (${response.status}): ${detail.slice(0, 200)}`
    );
  }

  const payload = JSON.parse(detail) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error('Shopify returned no access token');
  }

  return {
    accessToken: payload.access_token,
    scope: payload.scope || '',
    expiresInSeconds: payload.expires_in,
  };
}

export async function saveShopifyConnection(
  uid: string,
  brandId: string,
  shopDomain: string,
  token: ExchangedToken
): Promise<void> {
  await adminDb()
    .collection(SHOPIFY_CONNECTIONS_COLLECTION)
    .doc(brandId)
    .set(
      {
        ownerUid: uid,
        brandId,
        shopDomain,
        accessToken: token.accessToken,
        scope: token.scope,
        connectedAt: Timestamp.now(),
        expiresAt: token.expiresInSeconds
          ? Timestamp.fromMillis(Date.now() + token.expiresInSeconds * 1000)
          : null,
      },
      { merge: true }
    );
}

export async function getShopifyConnection(
  uid: string,
  brandId: string
): Promise<ShopifyConnection | null> {
  const snapshot = await adminDb()
    .collection(SHOPIFY_CONNECTIONS_COLLECTION)
    .doc(brandId)
    .get();

  if (!snapshot.exists) return null;

  const connection = snapshot.data() as ShopifyConnection;
  // Keyed by brand, so ownership is checked rather than assumed.
  if (connection.ownerUid !== uid) return null;

  return connection;
}

export async function deleteShopifyConnection(uid: string, brandId: string): Promise<void> {
  const connection = await getShopifyConnection(uid, brandId);
  if (!connection) return;
  await adminDb().collection(SHOPIFY_CONNECTIONS_COLLECTION).doc(brandId).delete();
}
