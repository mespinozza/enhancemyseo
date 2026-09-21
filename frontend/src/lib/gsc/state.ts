/**
 * Signed OAuth state.
 *
 * The Google callback arrives as a plain browser redirect with no Authorization header,
 * so the only thing tying it back to a user is the `state` parameter. Signing it means
 * the callback cannot be replayed or forged to attach someone else's Search Console
 * account to a brand profile, and the timestamp keeps a leaked URL from being useful
 * later.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_AGE_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  uid: string;
  brandId: string;
  /** Dashboard path to land on afterwards. Signed so it cannot be used as an open redirect. */
  returnTo?: string;
  issuedAt: number;
}

/**
 * Only in-app dashboard paths are allowed as a return target. Without this a signed state
 * would still be a redirect to anywhere, and the signature would make it look trustworthy.
 */
export function safeReturnTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith('/dashboard')) return undefined;
  // Reject protocol-relative and traversal attempts outright rather than sanitising.
  if (value.startsWith('//') || value.includes('..')) return undefined;
  return value;
}

function signingSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Set GOOGLE_OAUTH_STATE_SECRET (or CRON_SECRET) to connect Search Console');
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(body: string): string {
  return createHmac('sha256', signingSecret()).update(body).digest('base64url');
}

export function signState(uid: string, brandId: string, returnTo?: string): string {
  const body = base64UrlEncode(
    JSON.stringify({ uid, brandId, returnTo: safeReturnTo(returnTo), issuedAt: Date.now() })
  );
  return `${body}.${sign(body)}`;
}

export function verifyState(state: string): OAuthStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;

  const expected = sign(body);
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);

  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as OAuthStatePayload;
    if (!payload.uid || !payload.brandId) return null;
    if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
