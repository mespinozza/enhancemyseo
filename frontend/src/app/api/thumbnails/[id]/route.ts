import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { meterAs } from '@/lib/ai/meter';
import { normalizeDesign } from '@/lib/thumbnail/design';
import {
  deleteThumbnail,
  loadOwnThumbnail,
  regeneratePhoto,
  saveEdit,
  setTarget,
  thumbnailAccess,
  toRecord,
} from '@/lib/thumbnail/service';
import type { ThumbnailTarget } from '@/lib/thumbnail/types';
import { IMAGE_LIMIT_MESSAGE, refundImage, reserveImage } from '@/lib/credits/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const MAX_PNG_BYTES = 12 * 1024 * 1024;

async function context(request: NextRequest, params: Params['params'], needStudio: boolean) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return { error: auth.error };
  const access = await thumbnailAccess(auth.caller.uid, auth.caller.email);
  if (needStudio && !access.studio) {
    return { error: NextResponse.json({ error: 'Upgrade to edit thumbnails', code: 'not_allowed' }, { status: 403 }) };
  }
  const { id } = await params;
  const snap = await loadOwnThumbnail(auth.caller.uid, id);
  if (!snap) return { error: NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 }) };
  return { uid: auth.caller.uid, access, snap };
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await context(request, params, false);
  if ('error' in ctx) return ctx.error;
  return NextResponse.json({ thumbnail: await toRecord(ctx.snap, ctx.access) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** `{ target }` links or unlinks an article; `{ regenerate: true, direction? }` gets a new photo. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await context(request, params, true);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => ({}))) as {
    target?: ThumbnailTarget | null;
    regenerate?: boolean;
    direction?: string;
  };
  try {
    if (body.regenerate) {
      const charge = await reserveImage(ctx.uid, ctx.access.tier);
      if (!charge) return NextResponse.json({ error: IMAGE_LIMIT_MESSAGE, code: 'image_limit' }, { status: 429 });
      meterAs(ctx.uid);
      try {
        await regeneratePhoto(ctx.uid, ctx.snap, body.direction?.trim().slice(0, 300));
      } catch (error) {
        await refundImage(charge).catch(() => undefined);
        throw error;
      }
    } else if ('target' in body) {
      const t = body.target;
      const target: ThumbnailTarget | null =
        t?.kind === 'blog' && t.blogId
          ? { kind: 'blog', blogId: String(t.blogId) }
          : t?.kind === 'shopify' && t.articleId && t.shopifyBlogId
            ? { kind: 'shopify', articleId: String(t.articleId), shopifyBlogId: String(t.shopifyBlogId) }
            : null;
      await setTarget(ctx.uid, ctx.snap, target);
    }
    const fresh = await loadOwnThumbnail(ctx.uid, ctx.snap.id);
    return NextResponse.json({ thumbnail: await toRecord(fresh!, ctx.access) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed' }, { status: 500 });
  }
}

/** Saves an edit: the design as JSON and the PNG the editor drew from it. */
export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await context(request, params, true);
  if ('error' in ctx) return ctx.error;
  try {
    const form = await request.formData();
    const file = form.get('image');
    const designRaw = form.get('design');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || typeof designRaw !== 'string') {
      return NextResponse.json({ error: 'Missing image or design' }, { status: 400 });
    }
    const blob = file as Blob;
    if (blob.type !== 'image/png' || blob.size > MAX_PNG_BYTES) {
      return NextResponse.json({ error: 'The image must be a PNG under 12MB' }, { status: 400 });
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    // PNG signature, so only a real image is stored behind a public URL.
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      return NextResponse.json({ error: 'The image must be a PNG' }, { status: 400 });
    }
    const design = normalizeDesign(JSON.parse(designRaw), ctx.snap.get('title'));
    await saveEdit(ctx.uid, ctx.snap, design, bytes);
    const fresh = await loadOwnThumbnail(ctx.uid, ctx.snap.id);
    return NextResponse.json({ thumbnail: await toRecord(fresh!, ctx.access) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await context(request, params, false);
  if ('error' in ctx) return ctx.error;
  await deleteThumbnail(ctx.uid, ctx.snap);
  return NextResponse.json({ ok: true });
}
