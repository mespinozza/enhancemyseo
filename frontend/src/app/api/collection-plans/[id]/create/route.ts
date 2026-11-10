import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { createPlanned } from '@/lib/collections/plan';
import { planFailure } from '@/lib/collections/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { itemIds?: string[]; titles?: Record<string, string> };
  if (!Array.isArray(body.itemIds) || !body.itemIds.length) return NextResponse.json({ error: 'Pick collections to create' }, { status: 400 });
  try {
    return NextResponse.json({ items: await createPlanned(auth.caller.uid, id, body.itemIds, body.titles ?? {}) });
  } catch (error) {
    return planFailure(error, 'Creating collections failed');
  }
}
