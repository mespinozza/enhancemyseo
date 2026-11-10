import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { meterAs } from '@/lib/ai/meter';
import { planFailure } from '@/lib/collections/api';
import { deletePlan, listPlans, planCollections } from '@/lib/collections/plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Admin only while it is being tested, like keyword collections.

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const plans = await listPlans(auth.caller.uid, request.nextUrl.searchParams.get('brandId'));
  return NextResponse.json({ plans }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { brandId?: string; focus?: string; count?: number; minProducts?: number };
  if (!body.brandId) return NextResponse.json({ error: 'Pick a brand' }, { status: 400 });

  meterAs(auth.caller.uid);
  try {
    const plan = await planCollections({
      uid: auth.caller.uid,
      brandId: body.brandId,
      focus: body.focus,
      count: typeof body.count === 'number' ? body.count : undefined,
      minProducts: typeof body.minProducts === 'number' ? body.minProducts : undefined,
    });
    return NextResponse.json({ plan });
  } catch (error) {
    return planFailure(error, 'Collection plan failed');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    await deletePlan(auth.caller.uid, request.nextUrl.searchParams.get('id') ?? '');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
