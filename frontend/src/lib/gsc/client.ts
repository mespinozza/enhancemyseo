/**
 * Google Search Console access.
 *
 * Server-only. Talks to Google over plain fetch rather than pulling in `googleapis`,
 * which is a large dependency for the three calls this needs.
 *
 * Refresh tokens live in their own `gscConnections` collection rather than on the brand
 * profile, and the security rules deny clients all access to it. A brand profile is read
 * by the browser, and a Search Console refresh token is long-lived credentials for a
 * user's whole web property — it should never be in a document the client can fetch.
 */
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

export const GSC_CONNECTIONS_COLLECTION = 'gscConnections';

/** Read-only access to Search Console data; no write scopes are requested. */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/webmasters/v3';

export interface GscConnection {
  /**
   * Deliberately NOT named `userId`. `firestore.rules` contains a generic
   * `match /{collection}/{document}` rule that grants a client full access to any
   * document whose `userId` matches the caller, which would hand the browser a
   * long-lived Google refresh token. Naming the field differently means no client rule
   * can match this collection, and the explicit block in the rules file denies it
   * outright as well.
   */
  ownerUid: string;
  brandId: string;
  refreshToken: string;
  /** The account that granted access, shown in the UI so a user can tell which it was. */
  googleEmail?: string;
  connectedAt: Timestamp;
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function adminDb(): Firestore {
  initializeFirebaseAdmin();
  return getFirestore();
}

export function isGscConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The redirect URI must be byte-identical between the consent request and the token
 * exchange, and must be registered in the Google Cloud console. An explicit env var wins
 * so a deployment behind a proxy or custom domain cannot guess wrong.
 */
export function redirectUri(request?: Request): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }

  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const host = forwardedHost || request.headers.get('host');
    if (host) {
      const protocol = forwardedProto || (host.startsWith('localhost') ? 'http' : 'https');
      return `${protocol}://${host}/api/gsc/callback`;
    }
    return `${new URL(request.url).origin}/api/gsc/callback`;
  }

  throw new Error('GOOGLE_OAUTH_REDIRECT_URI is not set and no request was supplied');
}

export function buildConsentUrl(state: string, request: Request): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: GSC_SCOPE,
    // offline + consent are what actually produce a refresh token; without them a
    // returning user gets an access token only and the automation breaks in an hour.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * A stored refresh token is no longer usable and the user has to authorize again.
 *
 * The common cause is an OAuth consent screen left in "Testing" publishing status, which
 * caps refresh tokens at 7 days: automations work for a week and then every run fails.
 * Raw `invalid_grant` text tells a user nothing, so this carries a message that says what
 * to do about it.
 */
export class GscAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GscAuthError';
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const payload = (await response.json()) as TokenResponse;

  if (payload.error === 'invalid_grant') {
    throw new GscAuthError(
      'Search Console access has expired or been revoked. Reconnect it on the brand profile. ' +
        'If this happens about every 7 days, the Google OAuth consent screen is still in Testing status and needs publishing.'
    );
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || 'Google rejected the token request');
  }

  return payload;
}

/** Reads the email out of the id_token payload for display. Not used for authorization. */
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      email?: string;
    };
    return decoded.email;
  } catch {
    return undefined;
  }
}

export async function exchangeCodeForConnection(
  code: string,
  request: Request
): Promise<{ refreshToken: string; googleEmail?: string }> {
  const payload = await postToken({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
    redirect_uri: redirectUri(request),
    grant_type: 'authorization_code',
  });

  if (!payload.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Remove this app from your Google account permissions and connect again.'
    );
  }

  return {
    refreshToken: payload.refresh_token,
    googleEmail: emailFromIdToken(payload.id_token),
  };
}

async function accessTokenFor(refreshToken: string): Promise<string> {
  const payload = await postToken({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
    grant_type: 'refresh_token',
  });

  if (!payload.access_token) {
    throw new Error('Google returned no access token');
  }
  return payload.access_token;
}

export async function saveConnection(
  userId: string,
  brandId: string,
  refreshToken: string,
  googleEmail?: string
): Promise<void> {
  await adminDb()
    .collection(GSC_CONNECTIONS_COLLECTION)
    .doc(brandId)
    .set(
      {
        ownerUid: userId,
        brandId,
        refreshToken,
        googleEmail: googleEmail || null,
        connectedAt: Timestamp.now(),
      },
      { merge: true }
    );
}

export async function getConnection(userId: string, brandId: string): Promise<GscConnection | null> {
  const snapshot = await adminDb().collection(GSC_CONNECTIONS_COLLECTION).doc(brandId).get();
  if (!snapshot.exists) return null;

  const connection = snapshot.data() as GscConnection;
  // The document is keyed by brand, so ownership is checked rather than assumed.
  if (connection.ownerUid !== userId) return null;

  return connection;
}

export async function deleteConnection(userId: string, brandId: string): Promise<void> {
  const connection = await getConnection(userId, brandId);
  if (!connection) return;
  await adminDb().collection(GSC_CONNECTIONS_COLLECTION).doc(brandId).delete();
}

export async function listSites(connection: GscConnection): Promise<GscSite[]> {
  const accessToken = await accessTokenFor(connection.refreshToken);

  const response = await fetch(`${API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Search Console rejected the site list request (${response.status})`);
  }

  const payload = (await response.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };

  return (payload.siteEntry || []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Top search queries for a property over a trailing window.
 *
 * Search Console data lags by a couple of days, so the window ends three days back:
 * asking for today returns partial or empty rows and would make a healthy property look
 * like it has no traffic.
 */
export async function topQueries(
  connection: GscConnection,
  siteUrl: string,
  options: { lookbackDays: number; rowLimit?: number }
): Promise<GscQueryRow[]> {
  const accessToken = await accessTokenFor(connection.refreshToken);

  const endDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const startDate = new Date(endDate.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);

  const response = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: isoDate(startDate),
        endDate: isoDate(endDate),
        dimensions: ['query'],
        rowLimit: options.rowLimit ?? 250,
        dataState: 'final',
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Search Console rejected the query request (${response.status}): ${detail.slice(0, 200)}`
    );
  }

  const payload = (await response.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };

  return (payload.rows || []).map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}
