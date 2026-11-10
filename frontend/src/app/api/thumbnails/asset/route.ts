import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { requireSignedIn } from '@/lib/results/api-auth';
import { loadOwnThumbnail, readOwnObject, thumbnailAccess } from '@/lib/thumbnail/service';

export const dynamic = 'force-dynamic';

const PREVIEW_WIDTH = 800;

async function downscale(bytes: Buffer): Promise<Buffer> {
  const image = await loadImage(bytes);
  const width = Math.min(PREVIEW_WIDTH, image.width);
  const height = Math.round((image.height / image.width) * width);
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.encode('jpeg', 80);
}

/**
 * The caller's own stored images, same-origin so the editor canvas can read them. A
 * locked thumbnail only ever comes back as a small preview, and its photo not at all.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid, email } = auth.caller;
  const path = request.nextUrl.searchParams.get('path') ?? '';
  let preview = request.nextUrl.searchParams.get('preview') === '1';

  const [, owner, folder] = path.split('/');
  if (owner !== uid || !folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (folder !== 'logos') {
    const snap = await loadOwnThumbnail(uid, folder);
    if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (snap.get('locked')) {
      const access = await thumbnailAccess(uid, email);
      if (!access.paid) {
        if (path !== snap.get('imagePath')) return NextResponse.json({ error: 'Upgrade to unlock' }, { status: 403 });
        preview = true;
      }
    }
  }

  const object = await readOwnObject(uid, path);
  if (!object) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bytes = preview ? await downscale(object.bytes) : object.bytes;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': preview ? 'image/jpeg' : object.contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
