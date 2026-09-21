/**
 * Runs one automation on demand so a user can test a configuration without waiting for
 * its schedule. Like the cron tick, this responds before the work finishes: a full
 * generation takes minutes and the browser request would be cut off by Railway's
 * 5-minute idle limit long before then. The UI polls run history for the result.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  AutomationAccessError,
  claimForManualRun,
  finishManualRun,
  runAutomation,
} from '@/lib/automation/runner';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One manual run per user at a time, so the button cannot be used to fan out work. */
const running = new Set<string>();

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  let automationId: string | undefined;
  try {
    const body = (await request.json()) as { automationId?: string };
    automationId = body.automationId;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  if (!automationId) {
    return NextResponse.json({ error: 'automationId is required' }, { status: 400 });
  }

  if (running.has(uid)) {
    return NextResponse.json(
      { error: 'You already have an automation running. Wait for it to finish.' },
      { status: 429 }
    );
  }

  // Ownership and in-flight checks happen before responding so the caller gets a real
  // status code; only the slow generation is deferred to the background.
  let automation;
  try {
    automation = await claimForManualRun(uid, automationId);
  } catch (error) {
    if (error instanceof AutomationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[automation] could not claim manual run', error);
    return NextResponse.json({ error: 'Could not start this automation' }, { status: 500 });
  }

  running.add(uid);

  void runAutomation(automation)
    .then((outcomes) => {
      console.log('[automation] manual run finished', {
        automationId,
        outcomes: outcomes.map((outcome) => `${outcome.status}:${outcome.keyword}`),
      });
    })
    .catch((error) => {
      console.error('[automation] manual run failed', error);
    })
    .finally(() => {
      running.delete(uid);
      void finishManualRun(automationId as string);
    });

  return NextResponse.json({ started: true }, { status: 202 });
}
