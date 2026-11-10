import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { meterAs } from '@/lib/ai/meter';
import { shopifyCredentialResponse } from '@/lib/shopify/credentials';
import { deleteKeywordCollection, generateKeywordCollection, listKeywordCollections } from '@/lib/keywords/collection';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Admin only while it is being tested, like the thumbnail studio.

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const collections = await listKeywordCollections(auth.caller.uid, request.nextUrl.searchParams.get('brandId'));
  return NextResponse.json({ collections }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { brandId?: string; focus?: string; count?: number };
  if (!body.brandId) return NextResponse.json({ error: 'Pick a brand' }, { status: 400 });

  meterAs(auth.caller.uid);
  try {
    const collection = await generateKeywordCollection({
      uid: auth.caller.uid,
      brandId: body.brandId,
      focus: body.focus,
      count: typeof body.count === 'number' ? body.count : undefined,
    });
    return NextResponse.json({ collection });
  } catch (error) {
    if (error instanceof Error && error.name === 'ShopifyCredentialError') {
      const { error: message, status } = shopifyCredentialResponse(error);
      return NextResponse.json({ error: message, code: 'shopify' }, { status });
    }
    console.error('Keyword collection failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Keyword collection failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !(await deleteKeywordCollection(auth.caller.uid, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
