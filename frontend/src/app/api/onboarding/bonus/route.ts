/** Whether the caller still has the tutorial's free first article, so the UI only promises it when true. */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';
import { hasOnboardingBonus } from '@/lib/onboarding/bonus';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Paid plans never get it: the route only applies the bonus on the free plan.
  const status = await getServerUserSubscriptionStatus(decoded.uid, decoded.email || null);
  const available = status === 'free' && (await hasOnboardingBonus(getFirestore(), decoded.uid));
  return NextResponse.json({ available });
}
