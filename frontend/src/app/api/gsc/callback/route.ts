/**
 * Google OAuth callback. Arrives as a browser redirect, so the only proof of identity is
 * the signed `state` parameter minted by /api/gsc/connect.
 *
 * Always ends in a redirect back to the Automate page with a short status in the query
 * string, so the user lands somewhere useful whether or not it worked.
 */
import { NextResponse } from 'next/server';
import { exchangeCodeForConnection, isGscConfigured, saveConnection } from '@/lib/gsc/client';
import { safeReturnTo, verifyState } from '@/lib/gsc/state';
import { publicOrigin } from '@/lib/oauth/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backTo(request: Request, params: Record<string, string>, returnTo?: string) {
  const path = safeReturnTo(returnTo) || '/dashboard/automate';
  const origin = publicOrigin(request, process.env.GOOGLE_OAUTH_REDIRECT_URI);
  const target = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  if (!isGscConfigured()) {
    return backTo(request, { gsc: 'error', reason: 'Search Console is not configured' });
  }

  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error) {
    return backTo(request, { gsc: 'error', reason: error });
  }

  if (!code || !state) {
    return backTo(request, { gsc: 'error', reason: 'Google did not return an authorization code' });
  }

  const payload = verifyState(state);
  if (!payload) {
    return backTo(request, {
      gsc: 'error',
      reason: 'That connection link expired or was tampered with. Try again.',
    });
  }

  try {
    const { refreshToken, googleEmail } = await exchangeCodeForConnection(code, request);
    await saveConnection(payload.uid, payload.brandId, refreshToken, googleEmail);
    return backTo(request, { gsc: 'connected', brandId: payload.brandId }, payload.returnTo);
  } catch (caught) {
    console.error('[gsc] callback failed', caught);
    return backTo(
      request,
      {
        gsc: 'error',
        reason: caught instanceof Error ? caught.message : 'Could not finish connecting',
      },
      payload.returnTo
    );
  }
}
