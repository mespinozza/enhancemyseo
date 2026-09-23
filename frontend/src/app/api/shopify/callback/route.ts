/**
 * Shopify OAuth callback. Arrives as a browser redirect, so it carries no Authorization
 * header and is authenticated two ways instead: Shopify's own HMAC over the query string
 * proves the request came from Shopify, and the signed `state` minted by
 * /api/shopify/connect proves which user and brand it belongs to.
 *
 * Always ends in a redirect back into the dashboard with a short status in the query
 * string, so the user lands somewhere useful whether or not it worked.
 */
import { NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  isCallbackFresh,
  isShopifyAppConfigured,
  saveShopifyConnection,
  verifyCallbackSignature,
  verifyState,
} from '@/lib/shopify/oauth';
import { isValidShopDomain, normalizeShopDomain } from '@/lib/shopify/shop';
import { safeReturnTo } from '@/lib/oauth/state';
import { publicOrigin } from '@/lib/oauth/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backTo(request: Request, params: Record<string, string>, returnTo?: string) {
  const path = safeReturnTo(returnTo) || '/dashboard/settings/brands';
  const origin = publicOrigin(request, process.env.SHOPIFY_OAUTH_REDIRECT_URI);
  const target = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  if (!isShopifyAppConfigured()) {
    return backTo(request, { shopify: 'error', reason: 'The Shopify app is not configured' });
  }

  const url = new URL(request.url);

  // Signature first: nothing else in the query string can be trusted until it passes.
  if (!verifyCallbackSignature(url)) {
    return backTo(request, {
      shopify: 'error',
      reason: 'That response did not come from Shopify. Start the connection again.',
    });
  }

  if (!isCallbackFresh(url)) {
    return backTo(request, {
      shopify: 'error',
      reason: 'That connection link expired. Try again.',
    });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const shopDomain = normalizeShopDomain(url.searchParams.get('shop') || '');

  if (!code || !state) {
    return backTo(request, {
      shopify: 'error',
      reason: 'Shopify did not return an authorization code',
    });
  }

  if (!isValidShopDomain(shopDomain)) {
    return backTo(request, { shopify: 'error', reason: 'Shopify did not identify the store' });
  }

  const payload = verifyState(state);
  if (!payload) {
    return backTo(request, {
      shopify: 'error',
      reason: 'That connection link expired or was tampered with. Try again.',
    });
  }

  try {
    const token = await exchangeCodeForToken(shopDomain, code);
    await saveShopifyConnection(payload.uid, payload.brandId, shopDomain, token);
    return backTo(
      request,
      { shopify: 'connected', shop: shopDomain, brandId: payload.brandId },
      payload.returnTo
    );
  } catch (caught) {
    console.error('[shopify] callback failed', caught);
    return backTo(
      request,
      {
        shopify: 'error',
        reason: caught instanceof Error ? caught.message : 'Could not finish connecting',
      },
      payload.returnTo
    );
  }
}
