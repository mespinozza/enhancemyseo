/**
 * Forgets a store connection.
 *
 * Only drops our copy of the token. The app stays installed on the store until the
 * merchant removes it from their admin, which is theirs to decide.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { deleteShopifyConnection, getShopifyConnection } from '@/lib/shopify/oauth';
import { forgetShopifyToken } from '@/lib/shopify/credentials';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
  try {
    brandId = ((await request.json()) as { brandId?: string }).brandId;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  // Ownership is enforced inside getShopifyConnection, which returns nothing for a brand
  // belonging to someone else.
  const connection = await getShopifyConnection(uid, brandId);
  await deleteShopifyConnection(uid, brandId);
  if (connection) forgetShopifyToken(connection.shopDomain);

  return NextResponse.json({ success: true });
}
