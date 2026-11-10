import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { recordError } from '@/lib/errors/record';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

/**
 * Failures only the browser sees, such as a connection that dropped mid-article. The
 * server records its own errors; this covers the rest. Capped per account, since the
 * caller decides what is sent.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid, email } = auth.caller;

  const now = Date.now();
  const times = (recent.get(uid) ?? []).filter((at) => now - at < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) return NextResponse.json({ ok: true });
  recent.set(uid, [...times, now]);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  await recordError({
    source: 'article-client',
    message: text(body.message) ?? 'Unknown browser error',
    status: typeof body.status === 'number' ? body.status : null,
    stage: text(body.stage),
    blogId: text(body.blogId),
    brandId: text(body.brandId),
    keyword: text(body.keyword),
    log: Array.isArray(body.log) ? body.log.filter((line): line is string => typeof line === 'string') : [],
    uid,
    email,
    context: { page: text(body.page) },
  });
  return NextResponse.json({ ok: true });
}
