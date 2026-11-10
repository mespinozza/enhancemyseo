import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { ERROR_EVENTS, type ErrorEvent } from '@/lib/errors/types';

export const dynamic = 'force-dynamic';

/** The latest errors across every account, newest first. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  initializeFirebaseAdmin();
  const uid = request.nextUrl.searchParams.get('uid');
  let query = getFirestore().collection(ERROR_EVENTS).orderBy('createdAt', 'desc').limit(200);
  // One customer's errors are filtered here rather than with a composite index.
  if (uid) query = getFirestore().collection(ERROR_EVENTS).where('uid', '==', uid).limit(200);

  try {
    const snap = await query.get();
    const events: ErrorEvent[] = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          source: d.source,
          message: d.message,
          detail: d.detail ?? null,
          status: d.status ?? null,
          code: d.code ?? null,
          stage: d.stage ?? null,
          uid: d.uid ?? null,
          email: d.email ?? null,
          blogId: d.blogId ?? null,
          brandId: d.brandId ?? null,
          keyword: d.keyword ?? null,
          log: Array.isArray(d.log) ? d.log : [],
          context: d.context ?? null,
          createdAt: d.createdAt?.toDate?.().toISOString() ?? null,
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load error events:', error);
    return NextResponse.json({ error: 'Failed to load errors' }, { status: 500 });
  }
}
