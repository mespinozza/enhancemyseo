import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';

export interface Caller {
  uid: string;
  email: string | null;
}

/**
 * Every /api/results route authenticates the same way, so the check lives here rather
 * than being copied per route: a missed `subscription_status !== 'admin'` on one route
 * is all it takes to let anyone publish a case study.
 */
async function verifyCaller(request: NextRequest): Promise<Caller | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;

  try {
    initializeFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(header.slice('Bearer '.length));
    if (!decoded.uid) return null;
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

/** Resolves to the caller, or to the response to return instead. */
export async function requireSignedIn(
  request: NextRequest
): Promise<{ caller: Caller } | { error: NextResponse }> {
  const caller = await verifyCaller(request);
  if (!caller) {
    return { error: NextResponse.json({ error: 'Sign in to continue' }, { status: 401 }) };
  }
  return { caller };
}

export async function requireAdmin(
  request: NextRequest
): Promise<{ caller: Caller } | { error: NextResponse }> {
  const result = await requireSignedIn(request);
  if ('error' in result) return result;

  const tier = await getServerUserSubscriptionStatus(result.caller.uid, result.caller.email);
  if (tier !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return result;
}
