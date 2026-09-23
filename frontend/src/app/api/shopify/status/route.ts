/**
 * How a brand currently reaches its Shopify store, for the UI to describe.
 *
 * Reports the resolved source rather than the credential itself, so the browser learns
 * whether the store is reachable without ever receiving a token.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getShopifyConnection, isShopifyAppConfigured } from '@/lib/shopify/oauth';
import { normalizeShopDomain } from '@/lib/shopify/shop';

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

  const brandSnapshot = await getFirestore().collection('brandProfiles').doc(brandId).get();
  if (!brandSnapshot.exists || brandSnapshot.data()?.userId !== uid) {
    return NextResponse.json({ error: 'That brand profile is not yours' }, { status: 403 });
  }

  const brand = brandSnapshot.data() as {
    shopifyStoreUrl?: string;
    shopifyAccessToken?: string;
  };

  const connection = await getShopifyConnection(uid, brandId);
  const hasLegacyToken = Boolean(brand.shopifyAccessToken?.trim());

  return NextResponse.json({
    configured: isShopifyAppConfigured(),
    connected: Boolean(connection),
    storeUrl: normalizeShopDomain(brand.shopifyStoreUrl || '') || null,
    shopDomain: connection?.shopDomain || null,
    scope: connection?.scope || null,
    connectedAt: connection?.connectedAt?.toDate().toISOString() || null,
    /**
     * A legacy token still takes effect only when there is no connection, so the UI can
     * explain which one is actually in use rather than showing both as active.
     */
    hasLegacyToken,
    source: connection ? 'oauth' : hasLegacyToken ? 'stored' : isShopifyAppConfigured() ? 'app' : null,
  });
}
