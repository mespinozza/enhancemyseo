import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { deleteSubmission, updateSubmissionStatus } from '@/lib/results/server';
import { SubmissionStatus } from '@/lib/results/types';

initializeFirebaseAdmin();

const STATUSES: SubmissionStatus[] = ['new', 'reviewing', 'published', 'archived'];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  try {
    const body = (await request.json()) as { status?: unknown };
    const status = body.status as SubmissionStatus;
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }

    await updateSubmissionStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to update submission:', error);
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteSubmission(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete submission:', error);
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 });
  }
}
