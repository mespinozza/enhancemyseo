/**
 * What a Search Console automation would write about, without running it.
 *
 * Deliberately runs the same ranking the runner does, from `selection.ts`, rather than a
 * simplified version: a preview that disagrees with the run is worse than no preview.
 * Candidates that are ruled out come back flagged instead of removed, so a threshold set
 * too high is visible as a list of near misses rather than an empty panel.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  GscAuthError,
  getConnection,
  isGscConfigured,
  topPageQueries,
  topQueries,
} from '@/lib/gsc/client';
import { coveredKeywords } from '@/lib/automation/covered';
import {
  collectPageCandidates,
  collectQueryCandidates,
  eligibleCandidates,
  type GscCandidate,
} from '@/lib/automation/selection';
import type { AutomationGscConfig } from '@/lib/automation/types';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enough to show the shape of the traffic without turning the panel into a report. */
const PREVIEW_ROWS = 25;
/** How stale the already-written set may be while a user tunes the settings. */
const COVERED_MAX_AGE_MS = 5 * 60_000;

interface PreviewRequest {
  brandId?: string;
  siteUrl?: string;
  dimension?: AutomationGscConfig['dimension'];
  metric?: AutomationGscConfig['metric'];
  lookbackDays?: number;
  minMetric?: number;
}

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

  const body = (await request.json().catch(() => ({}))) as PreviewRequest;
  if (!body.brandId || !body.siteUrl) {
    return NextResponse.json({ error: 'brandId and siteUrl are required' }, { status: 400 });
  }

  if (!isGscConfigured()) {
    return NextResponse.json(
      { error: 'Search Console is not set up on this deployment.' },
      { status: 503 }
    );
  }

  // Ownership is enforced here: the connection is only returned to the user it belongs to.
  const connection = await getConnection(uid, body.brandId);
  if (!connection) {
    return NextResponse.json(
      { error: 'Search Console is not connected for this brand.' },
      { status: 404 }
    );
  }

  const config: AutomationGscConfig = {
    siteUrl: body.siteUrl,
    dimension: body.dimension === 'page' ? 'page' : 'query',
    metric: body.metric === 'impressions' ? 'impressions' : 'clicks',
    lookbackDays: Math.min(Math.max(Number(body.lookbackDays) || 30, 7), 90),
    minMetric: Math.max(Number(body.minMetric) || 1, 0),
  };

  try {
    // The preview re-fires on every settings change, and scanning the brand's articles
    // is the expensive half of it. A few minutes of staleness here only affects which
    // rows are badged as already written; the run itself still checks for real.
    const covered = await coveredKeywords(getFirestore(), uid, body.brandId, {
      maxAgeMs: COVERED_MAX_AGE_MS,
    });
    const options = { lookbackDays: config.lookbackDays };

    let candidates: GscCandidate[];
    if (config.dimension === 'page') {
      candidates = collectPageCandidates(
        await topPageQueries(connection, config.siteUrl, options),
        config,
        covered
      );
    } else {
      candidates = collectQueryCandidates(
        await topQueries(connection, config.siteUrl, options),
        config,
        covered
      );
    }

    return NextResponse.json({
      dimension: config.dimension,
      metric: config.metric,
      lookbackDays: config.lookbackDays,
      // Counted over everything, not just the rows sent back, so the summary line is honest.
      totalCandidates: candidates.length,
      eligibleCount: eligibleCandidates(candidates).length,
      candidates: candidates.slice(0, PREVIEW_ROWS),
    });
  } catch (error) {
    console.error('[gsc] preview failed', error);

    const needsReconnect = error instanceof GscAuthError;
    return NextResponse.json(
      {
        error: needsReconnect
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Search Console would not return your traffic. Try again shortly.',
        needsReconnect,
      },
      { status: needsReconnect ? 401 : 502 }
    );
  }
}
