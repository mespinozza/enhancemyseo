import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/results/api-auth';
import { meterAs } from '@/lib/ai/meter';
import { generateKeywordList } from '@/lib/keywords/list';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** A list of new article keywords for bulk generation, which only admins have. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { uid } = auth.caller;

  const body = await request.json().catch(() => ({}));
  const brandId = typeof body.brandId === 'string' ? body.brandId.trim().slice(0, 128) : '';
  if (!brandId) return NextResponse.json({ error: 'Pick a brand profile first' }, { status: 400 });

  meterAs(uid);
  try {
    const result = await generateKeywordList({
      uid,
      brandId,
      count: Number(body.count) || 25,
      focus: typeof body.focus === 'string' ? body.focus : null,
      queued: Array.isArray(body.queued) ? body.queued.slice(0, 300) : [],
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Keyword list failed:', error);
    const message = error instanceof Error ? error.message : '';
    const known = message === 'Brand profile not found' || message.startsWith('No new keywords');
    return NextResponse.json({ error: known ? message : 'Could not build a keyword list. Try again.' }, { status: known ? 400 : 502 });
  }
}
