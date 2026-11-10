import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { shopifyAccess } from '@/lib/collections/plan';

export const dynamic = 'force-dynamic';

/** Whether the brand's store is reachable and lets us create collections. Never returns a token. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  return NextResponse.json({ access: await shopifyAccess(auth.caller.uid, brandId) }, { headers: { 'Cache-Control': 'no-store' } });
}
