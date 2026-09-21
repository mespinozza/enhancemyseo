/**
 * Whether a brand has Search Console connected, and which properties it can see.
 *
 * The connection document is unreadable by clients by design, so this is the only way
 * the UI can find out. The refresh token itself is never returned.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { GscAuthError, getConnection, isGscConfigured, listSites } from '@/lib/gsc/client';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const brandId = new URL(request.url).searchParams.get('brandId');
  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  if (!isGscConfigured()) {
    return NextResponse.json({ configured: false, connected: false, sites: [] });
  }

  const connection = await getConnection(uid, brandId);
  if (!connection) {
    return NextResponse.json({ configured: true, connected: false, sites: [] });
  }

  try {
    const sites = await listSites(connection);
    return NextResponse.json({
      configured: true,
      connected: true,
      googleEmail: connection.googleEmail || null,
      // Only properties the account can actually read data for are worth offering.
      sites: sites.filter((site) => site.permissionLevel !== 'siteUnverifiedUser'),
    });
  } catch (error) {
    console.error('[gsc] could not list sites', error);

    // A dead refresh token is a different situation from a transient API failure: the
    // user has to authorize again, and the UI should say so rather than offer a retry.
    const needsReconnect = error instanceof GscAuthError;

    return NextResponse.json({
      configured: true,
      connected: true,
      needsReconnect,
      googleEmail: connection.googleEmail || null,
      sites: [],
      error: needsReconnect
        ? error.message
        : 'Connected, but Search Console would not return your properties. Try again shortly.',
    });
  }
}
