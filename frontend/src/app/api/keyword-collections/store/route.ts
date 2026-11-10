import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { shopifyCredentialResponse } from '@/lib/shopify/credentials';
import { storeOverview } from '@/lib/keywords/collection';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** What the brand's store already has, and which parts no article covers yet. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'Pick a brand' }, { status: 400 });

  try {
    const overview = await storeOverview(auth.caller.uid, brandId, request.nextUrl.searchParams.get('fresh') === '1');
    return NextResponse.json({ overview }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'ShopifyCredentialError') {
      const { error: message, status } = shopifyCredentialResponse(error);
      return NextResponse.json({ error: message, code: 'shopify' }, { status });
    }
    console.error('Store overview failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read the store' }, { status: 500 });
  }
}
