import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { removeBrandLogo, saveBrandLogo, saveBrandLogoStyle, thumbnailAccess } from '@/lib/thumbnail/service';
import { normalizeLogoStyle } from '@/lib/thumbnail/design';

export const dynamic = 'force-dynamic';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

async function authorize(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return { error: auth.error };
  const access = await thumbnailAccess(auth.caller.uid, auth.caller.email);
  if (!access.studio) return { error: NextResponse.json({ error: 'Upgrade to edit thumbnails' }, { status: 403 }) };
  return { uid: auth.caller.uid };
}

const failure = (error: unknown, fallback: string) =>
  NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });

/** A brand's thumbnail logo, used by every thumbnail made for it from now on. */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;

  const form = await request.formData();
  const brandId = form.get('brandId');
  const file = form.get('file');
  if (typeof brandId !== 'string' || !file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Missing brand or file' }, { status: 400 });
  }
  const blob = file as Blob;
  if (!TYPES.includes(blob.type) || blob.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Use a PNG, JPEG or WebP under 4MB' }, { status: 400 });
  }
  try {
    const path = await saveBrandLogo(auth.uid, brandId, Buffer.from(await blob.arrayBuffer()), blob.type);
    return NextResponse.json({ logoUrl: `/api/thumbnails/asset?path=${encodeURIComponent(path)}`, path });
  } catch (error) {
    return failure(error, 'Upload failed');
  }
}

/** Saves how the logo is drawn (image, text or none, and its size) as the brand's default. */
export async function PATCH(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const style = normalizeLogoStyle(body.style);
  if (typeof body.brandId !== 'string' || !style) {
    return NextResponse.json({ error: 'Missing brand or logo style' }, { status: 400 });
  }
  try {
    await saveBrandLogoStyle(auth.uid, body.brandId, style);
    return NextResponse.json({ style });
  } catch (error) {
    return failure(error, 'Could not save the logo');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  try {
    await removeBrandLogo(auth.uid, brandId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, 'Could not remove the logo');
  }
}
