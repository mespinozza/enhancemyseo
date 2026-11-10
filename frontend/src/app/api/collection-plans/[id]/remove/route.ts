import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { removeCreated } from '@/lib/collections/plan';
import { planFailure } from '@/lib/collections/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { itemIds?: string[] };
  if (!Array.isArray(body.itemIds) || !body.itemIds.length) return NextResponse.json({ error: 'Pick collections to remove' }, { status: 400 });
  try {
    return NextResponse.json({ items: await removeCreated(auth.caller.uid, id, body.itemIds) });
  } catch (error) {
    return planFailure(error, 'Removing collections failed');
  }
}
