import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/results/api-auth';
import { saveBrandLogo, thumbnailAccess } from '@/lib/thumbnail/service';

export const dynamic = 'force-dynamic';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

/** A brand's thumbnail logo, used by every thumbnail made for it from now on. */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const access = await thumbnailAccess(auth.caller.uid, auth.caller.email);
  if (!access.studio) return NextResponse.json({ error: 'Upgrade to edit thumbnails' }, { status: 403 });

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
    const path = await saveBrandLogo(auth.caller.uid, brandId, Buffer.from(await blob.arrayBuffer()), blob.type);
    return NextResponse.json({ logoUrl: `/api/thumbnails/asset?path=${encodeURIComponent(path)}`, path });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}
