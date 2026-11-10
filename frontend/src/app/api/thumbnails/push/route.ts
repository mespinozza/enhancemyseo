import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { internalBaseUrl } from '@/lib/internal-url';
import { loadOwnThumbnail, pushThumbnail, thumbnailAccess, type PushOutcome } from '@/lib/thumbnail/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PER_REQUEST = 25;

/** Sends a group of thumbnails to Shopify, one at a time, reporting each. */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const access = await thumbnailAccess(auth.caller.uid, auth.caller.email);
  if (!access.studio) return NextResponse.json({ error: 'Upgrade to push thumbnails' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    status?: 'draft' | 'published';
    shopifyBlogId?: string;
  };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, MAX_PER_REQUEST) : [];
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one thumbnail' }, { status: 400 });

  const idToken = request.headers.get('Authorization')!.slice('Bearer '.length);
  const results: PushOutcome[] = [];
  for (const id of ids) {
    const snap = await loadOwnThumbnail(auth.caller.uid, id);
    if (!snap) {
      results.push({ id, ok: false, message: 'Not found' });
      continue;
    }
    results.push(
      await pushThumbnail(auth.caller.uid, snap, {
        idToken,
        baseUrl: internalBaseUrl(),
        status: body.status === 'published' ? 'published' : 'draft',
        shopifyBlogId: typeof body.shopifyBlogId === 'string' ? body.shopifyBlogId : undefined,
      }),
    );
  }
  return NextResponse.json({ results });
}
