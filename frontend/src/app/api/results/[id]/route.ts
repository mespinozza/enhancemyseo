import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { parseCaseStudyBody } from '@/lib/results/payload';
import {
  deleteCaseStudy,
  getCaseStudyById,
  isSlugAvailable,
  updateCaseStudy,
} from '@/lib/results/server';

initializeFirebaseAdmin();

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  try {
    const caseStudy = await getCaseStudyById(id);
    if (!caseStudy) {
      return NextResponse.json({ error: 'Case study not found' }, { status: 404 });
    }
    return NextResponse.json({ caseStudy });
  } catch (error) {
    console.error('Failed to load case study:', error);
    return NextResponse.json({ error: 'Failed to load case study' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  try {
    const { values, errors } = parseCaseStudyBody(await request.json());
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }
    if (!(await isSlugAvailable(values.slug as string, id))) {
      return NextResponse.json(
        { error: `The URL slug "${values.slug}" is already taken.` },
        { status: 409 }
      );
    }

    await updateCaseStudy(id, values);
    return NextResponse.json({ id, slug: values.slug });
  } catch (error) {
    console.error('Failed to update case study:', error);
    return NextResponse.json({ error: 'Failed to update case study' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteCaseStudy(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete case study:', error);
    return NextResponse.json({ error: 'Failed to delete case study' }, { status: 500 });
  }
}
