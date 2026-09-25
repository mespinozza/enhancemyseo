import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { listSubmissions } from '@/lib/results/server';

initializeFirebaseAdmin();

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    return NextResponse.json({ submissions: await listSubmissions() });
  } catch (error) {
    console.error('Failed to list submissions:', error);
    return NextResponse.json({ error: 'Failed to load submissions' }, { status: 500 });
  }
}
