/**
 * Signed OAuth state, shared by the provider connections.
 *
 * A provider's callback arrives as a plain browser redirect with no Authorization
 * header, so the only thing tying it back to a user is the `state` parameter. Signing it
 * means the callback cannot be replayed or forged to attach someone else's account to a
 * brand profile, and the timestamp keeps a leaked URL from being useful later.
 *
 * Each provider supplies its own signing secret, so a state minted for one can never be
 * presented to another.
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

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export interface StateCodec {
  signState(uid: string, brandId: string, returnTo?: string): string;
  verifyState(state: string): OAuthStatePayload | null;
}

/**
 * @param resolveSecret Read lazily, so a deployment missing the variable fails when a
 * connection is attempted rather than at import time, which would take down the route.
 */
export function createStateCodec(resolveSecret: () => string): StateCodec {
  const sign = (body: string): string =>
    createHmac('sha256', resolveSecret()).update(body).digest('base64url');

  return {
    signState(uid, brandId, returnTo) {
      const body = base64UrlEncode(
        JSON.stringify({ uid, brandId, returnTo: safeReturnTo(returnTo), issuedAt: Date.now() })
      );
      return `${body}.${sign(body)}`;
    },

    verifyState(state) {
      const [body, signature] = state.split('.');
      if (!body || !signature) return null;

      const provided = Buffer.from(signature);
      const computed = Buffer.from(sign(body));

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
    },
  };
}
