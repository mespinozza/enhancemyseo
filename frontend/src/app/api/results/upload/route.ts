import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';

initializeFirebaseAdmin();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Screenshots go to Firebase Storage rather than the container's disk, which the older
 * /api/upload-image route uses. Railway's filesystem does not survive a redeploy, and
 * proof screenshots that vanish on the next deploy are worse than no proof at all.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;

  try {
    const form = await request.formData();
    const entry = form.get('file');

    // Checked by shape rather than `entry instanceof File`: the File constructor is
    // not in scope in Next's bundled server runtime, so that comparison throws a
    // ReferenceError instead of returning false.
    if (!entry || typeof entry === 'string' || typeof entry.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const file = entry as Blob & { name?: string };
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP and GIF images are allowed.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Images must be 8MB or smaller.' }, { status: 400 });
    }

    const bucket = getStorage().bucket();
    const extension = EXTENSIONS[file.type] ?? 'jpg';
    const objectPath = `results/${auth.caller.uid}/${Date.now()}-${randomUUID()}.${extension}`;

    // A download token makes the object readable by URL without opening the bucket up
    // with a public ACL, which uniform bucket-level access would reject anyway.
    const downloadToken = randomUUID();
    await bucket.file(objectPath).save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
      `/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Results screenshot upload failed:', error);

    // Firebase Storage is opt-in per project, and until someone enables it the bucket
    // genuinely does not exist. That is a setup task, not a bug, so say so rather than
    // leaving an admin staring at "failed to upload". Two different messages show up:
    // the bucket is missing, or the SDK was initialised without a bucket name at all,
    // which is what a dev server started before this route existed will report.
    const message = error instanceof Error ? error.message : '';
    const isSetupProblem =
      message.includes('bucket does not exist') ||
      message.includes('notFound') ||
      message.includes('Bucket name not specified') ||
      message.includes('storageBucket');

    if (isSetupProblem) {
      return NextResponse.json(
        {
          error: 'Image uploads are not set up yet.',
          setup:
            'Enable Storage for this Firebase project (Firebase console → Build → Storage → ' +
            'Get started), then set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to the bucket name it ' +
            'gives you and restart the server. In the meantime you can paste image URLs ' +
            'instead of uploading.',
        },
        { status: 503 }
      );
    }

    // Pass the underlying reason along: only signed-in users reach this route, and
    // "Failed to upload image" on its own is impossible to act on.
    return NextResponse.json(
      { error: 'Failed to upload image', detail: message.slice(0, 300) },
      { status: 500 }
    );
  }
}
