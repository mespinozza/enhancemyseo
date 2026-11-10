import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';
import { meterAs } from '@/lib/ai/meter';
import {
  claimTutorialThumbnail,
  createThumbnail,
  releaseTutorialThumbnail,
  thumbnailAccess,
  toRecord,
} from '@/lib/thumbnail/service';
import { THUMBNAILS_COLLECTION, type ThumbnailTarget } from '@/lib/thumbnail/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** The caller's thumbnails, newest first, optionally for one brand. */
export async function GET(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const access = await thumbnailAccess(auth.caller.uid, auth.caller.email);

  initializeFirebaseAdmin();
  const brandId = request.nextUrl.searchParams.get('brandId');
  const blogId = request.nextUrl.searchParams.get('blogId');
  let query = getFirestore().collection(THUMBNAILS_COLLECTION).where('userId', '==', auth.caller.uid);
  if (brandId) query = query.where('brandId', '==', brandId);
  const snap = await query.get();
  const docs = snap.docs
    .filter((doc) => !blogId || (doc.get('target')?.kind === 'blog' && doc.get('target')?.blogId === blogId))
    .sort((a, b) => (b.get('createdAt')?.toMillis?.() ?? 0) - (a.get('createdAt')?.toMillis?.() ?? 0))
    .slice(0, 200);

  const thumbnails = await Promise.all(docs.map((doc) => toRecord(doc, access)));
  return NextResponse.json(
    { thumbnails, studio: access.studio, paid: access.paid },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

interface CreateBody {
  brandId?: string;
  title?: string;
  keyword?: string;
  target?: ThumbnailTarget | null;
  direction?: string;
  /** The welcome tutorial's one thumbnail, allowed without the studio. */
  tutorial?: boolean;
}

function validTarget(target: unknown): ThumbnailTarget | null {
  if (!target || typeof target !== 'object') return null;
  const t = target as Record<string, unknown>;
  if (t.kind === 'blog' && typeof t.blogId === 'string' && t.blogId) return { kind: 'blog', blogId: t.blogId };
  if (t.kind === 'shopify' && (typeof t.articleId === 'string' || typeof t.articleId === 'number') && t.shopifyBlogId) {
    return { kind: 'shopify', articleId: String(t.articleId), shopifyBlogId: String(t.shopifyBlogId) };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid, email } = auth.caller;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const title = body.title?.trim().slice(0, 160);
  if (!body.brandId || !title) {
    return NextResponse.json({ error: 'A brand and a title are needed' }, { status: 400 });
  }

  const access = await thumbnailAccess(uid, email);
  if (!access.studio && (!body.tutorial || !(await claimTutorialThumbnail(uid, access)))) {
    return NextResponse.json({ error: 'Thumbnails come with a paid plan', code: 'not_allowed' }, { status: 403 });
  }

  meterAs(uid);
  try {
    const snap = await createThumbnail({
      uid,
      brandId: body.brandId,
      title,
      keyword: body.keyword?.trim().slice(0, 160) || null,
      target: validTarget(body.target),
      direction: body.direction?.trim().slice(0, 300),
    });
    return NextResponse.json({ thumbnail: await toRecord(snap, access) });
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    if (!access.studio) await releaseTutorialThumbnail(uid);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Thumbnail generation failed' },
      { status: 500 },
    );
  }
}
