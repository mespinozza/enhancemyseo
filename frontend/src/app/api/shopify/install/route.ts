/**
 * Where Shopify sends a merchant who opens the app from their admin.
 *
 * Set this as the app's App URL in the Dev Dashboard. Shopify appends `shop`, `hmac` and
 * `timestamp` and expects the app to take it from here; without a route like this the
 * merchant just lands on the marketing site and nothing happens.
 *
 * It does not grant anything itself. A store access token is stored against a brand
 * profile, and a request arriving from Shopify carries no proof of who the visitor is in
 * our app — so this verifies the handoff really came from Shopify, then drops the visitor
 * into the brand profiles page with the store named. Signing in and choosing which brand
 * the store belongs to happens there, through the same flow the Connect button uses.
 */
import { NextResponse } from 'next/server';
import { isCallbackFresh, isShopifyAppConfigured, verifyCallbackSignature } from '@/lib/shopify/oauth';
import { isValidShopDomain, normalizeShopDomain } from '@/lib/shopify/shop';
import { publicOrigin } from '@/lib/oauth/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANDING_PATH = '/dashboard/settings/brands';

function landOn(request: Request, params: Record<string, string>) {
  const origin = publicOrigin(request, process.env.SHOPIFY_OAUTH_REDIRECT_URI);
  const target = new URL(LANDING_PATH, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  if (!isShopifyAppConfigured()) {
    return landOn(request, { shopify: 'error', reason: 'The Shopify app is not configured' });
  }

  const url = new URL(request.url);

  // A real handoff is always signed. Anything else is someone guessing at the URL, and is
  // sent to the plain page rather than being told what was wrong with their attempt.
  if (!verifyCallbackSignature(url) || !isCallbackFresh(url)) {
    return landOn(request, {});
  }

  const shopDomain = normalizeShopDomain(url.searchParams.get('shop') || '');
  if (!isValidShopDomain(shopDomain)) {
    return landOn(request, {});
  }

  return landOn(request, { shopifyInstall: shopDomain });
}
