/**
 * Signed OAuth state for the Search Console connection.
 *
 * The mechanics live in `@/lib/oauth/state`, shared with the Shopify connection. This
 * only pins the signing secret, which is what keeps a Google state from being accepted
 * by another provider's callback.
 */
import { createStateCodec } from '@/lib/oauth/state';

export { safeReturnTo } from '@/lib/oauth/state';
export type { OAuthStatePayload } from '@/lib/oauth/state';

const codec = createStateCodec(() => {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('Set GOOGLE_OAUTH_STATE_SECRET (or CRON_SECRET) to connect Search Console');
  }
  return secret;
});

export const signState = codec.signState;
export const verifyState = codec.verifyState;
