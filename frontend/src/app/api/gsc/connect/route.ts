/**
 * Starts the Search Console connection.
 *
 * Returns the consent URL instead of redirecting, because the browser needs to send a
 * Firebase ID token to prove who is asking and a top-level redirect cannot carry a
 * header. The client navigates to the returned URL itself.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { buildConsentUrl, isGscConfigured } from '@/lib/gsc/client';
import { signState } from '@/lib/gsc/state';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isGscConfigured()) {
    return NextResponse.json(
      { error: 'Search Console is not configured on this deployment yet' },
      { status: 503 }
    );
  }

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

  let brandId: string | undefined;
  let returnTo: string | undefined;
  try {
    const body = (await request.json()) as { brandId?: string; returnTo?: string };
    brandId = body.brandId;
    returnTo = body.returnTo;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Confirm the caller owns the brand before minting state that would let the callback
  // write a connection for it.
  const brandSnapshot = await getFirestore().collection('brandProfiles').doc(brandId).get();
  if (!brandSnapshot.exists || brandSnapshot.data()?.userId !== uid) {
    return NextResponse.json({ error: 'That brand profile is not yours' }, { status: 403 });
  }

  try {
    const url = buildConsentUrl(signState(uid, brandId, returnTo), request);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[gsc] could not build the consent URL', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start the connection' },
      { status: 500 }
    );
  }
}
