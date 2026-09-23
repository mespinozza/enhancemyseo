/**
 * Starts a Shopify store connection.
 *
 * Returns the authorize URL instead of redirecting, because the browser needs to send a
 * Firebase ID token to prove who is asking and a top-level redirect cannot carry a
 * header. The client navigates to the returned URL itself.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { buildInstallUrl, isShopifyAppConfigured, signState } from '@/lib/shopify/oauth';
import { isValidShopDomain, normalizeShopDomain } from '@/lib/shopify/shop';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isShopifyAppConfigured()) {
    return NextResponse.json(
      { error: 'The Shopify app is not configured on this deployment yet' },
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

  let body: { brandId?: string; shopDomain?: string; returnTo?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  if (!body.brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Confirm the caller owns the brand before minting state that would let the callback
  // write a connection for it.
  const brandSnapshot = await getFirestore().collection('brandProfiles').doc(body.brandId).get();
  if (!brandSnapshot.exists || brandSnapshot.data()?.userId !== uid) {
    return NextResponse.json({ error: 'That brand profile is not yours' }, { status: 403 });
  }

  // The store can come from the form before it has been saved, otherwise fall back to
  // whatever is on the profile.
  const shopDomain = normalizeShopDomain(
    body.shopDomain || (brandSnapshot.data()?.shopifyStoreUrl as string | undefined) || ''
  );

  if (!shopDomain) {
    return NextResponse.json(
      { error: 'Add your Shopify store URL first, then connect.' },
      { status: 400 }
    );
  }

  if (!isValidShopDomain(shopDomain)) {
    return NextResponse.json(
      {
        error:
          `${shopDomain} is not a myshopify.com address. Use the store's permanent ` +
          'my-store.myshopify.com domain rather than a custom domain.',
      },
      { status: 400 }
    );
  }

  try {
    const url = buildInstallUrl(shopDomain, signState(uid, body.brandId, body.returnTo), request);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('[shopify] could not build the authorize URL', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start the connection' },
      { status: 500 }
    );
  }
}
