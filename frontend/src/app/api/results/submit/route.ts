import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';
import { parseMetrics } from '@/lib/results/payload';
import { createSubmission } from '@/lib/results/server';

initializeFirebaseAdmin();

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json()) as Record<string, unknown>;

    const storeName = str(body.storeName, 120);
    const message = str(body.message, 4_000);
    if (!storeName) {
      return NextResponse.json({ error: 'Tell us which store this is for.' }, { status: 400 });
    }

    const screenshots = Array.isArray(body.screenshots)
      ? (body.screenshots as unknown[])
          .map((url) => str(url, 1_000))
          .filter((url) => url.startsWith('https://'))
          .slice(0, 6)
      : [];

    await createSubmission({
      // Taken from the verified token, never from the body: otherwise a submission
      // could be filed against someone else's account.
      ownerUid: auth.caller.uid,
      email: auth.caller.email ?? '',
      name: str(body.name, 120),
      storeName,
      storeUrl: str(body.storeUrl, 300),
      message,
      metrics: parseMetrics(body.metrics),
      screenshots,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to record results submission:', error);
    return NextResponse.json({ error: 'Failed to send your results' }, { status: 500 });
  }
}
