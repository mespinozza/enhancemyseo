import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { parseCaseStudyBody } from '@/lib/results/payload';
import { createCaseStudy, isSlugAvailable, listAllCaseStudies } from '@/lib/results/server';

initializeFirebaseAdmin();

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    return NextResponse.json({ caseStudies: await listAllCaseStudies() });
  } catch (error) {
    console.error('Failed to list case studies:', error);
    return NextResponse.json({ error: 'Failed to load case studies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const { values, errors } = parseCaseStudyBody(await request.json());
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }
    if (!(await isSlugAvailable(values.slug as string))) {
      return NextResponse.json(
        { error: `The URL slug "${values.slug}" is already taken.` },
        { status: 409 }
      );
    }

    const id = await createCaseStudy(auth.caller.uid, values);
    return NextResponse.json({ id, slug: values.slug });
  } catch (error) {
    console.error('Failed to create case study:', error);
    return NextResponse.json({ error: 'Failed to create case study' }, { status: 500 });
  }
}
