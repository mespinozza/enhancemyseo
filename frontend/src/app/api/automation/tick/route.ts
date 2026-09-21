/**
 * Cron entry point for automations.
 *
 * Responds before the work is done. Railway closes an HTTP request after 5 minutes with
 * no data transferred and caps every request at 15 minutes, and generating even one
 * article can exceed that quietly. Because the web service is a long-running Node
 * process rather than a serverless function, work started here keeps running after the
 * response is sent, so the cron request itself lasts milliseconds.
 */
import { NextResponse } from 'next/server';
import { processDueAutomations, type TickSummary } from '@/lib/automation/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Guards against a slow batch overlapping the next tick within this process. Railway
 * already skips a cron execution while the previous one is active, but the tick returns
 * immediately, so that protection does not apply here.
 */
let inFlight: Promise<TickSummary> | null = null;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('x-cron-secret');
  if (header && header === secret) return true;

  const authHeader = request.headers.get('Authorization');
  return authHeader === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on this service' },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (inFlight) {
    return NextResponse.json({ started: false, reason: 'A previous tick is still running' });
  }

  const batch = processDueAutomations()
    .then((summary) => {
      console.log('[automation] tick finished', {
        claimed: summary.claimed,
        reaped: summary.reaped,
        outcomes: summary.outcomes.map((outcome) => `${outcome.status}:${outcome.keyword}`),
      });
      return summary;
    })
    .catch((error) => {
      console.error('[automation] tick failed', error);
      return { claimed: 0, reaped: 0, outcomes: [] } as TickSummary;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = batch;

  // Debug affordance: `?wait=1` blocks on the batch so a run can be inspected by hand.
  // Only useful for a single quick automation, since Railway will cut the request off.
  const url = new URL(request.url);
  if (url.searchParams.get('wait') === '1') {
    const summary = await batch;
    return NextResponse.json({ started: true, ...summary });
  }

  return NextResponse.json({ started: true });
}

export async function POST(request: Request) {
  return handle(request);
}

/** GET is accepted so the schedule can be triggered by anything that can fetch a URL. */
export async function GET(request: Request) {
  return handle(request);
}
