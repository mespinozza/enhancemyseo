import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { ERROR_EVENTS, type ErrorSource } from './types';

export interface ErrorReport {
  source: ErrorSource;
  message: string;
  uid?: string | null;
  email?: string | null;
  /** Server detail behind a friendly message, such as the provider's own error. */
  detail?: string | null;
  status?: number | null;
  code?: string | null;
  /** The last step reached, from the progress log. */
  stage?: string | null;
  blogId?: string | null;
  brandId?: string | null;
  keyword?: string | null;
  /** The tail of the generation log. */
  log?: string[];
  context?: Record<string, string | number | boolean | null>;
}

const clip = (value: unknown, max: number) => (value == null ? null : String(value).slice(0, max));

/**
 * Keeps a failure for the admin error log. The document has a `uid` field and no
 * `userId`, so the general owner rule never hands it to a browser. Never throws: a
 * failure to record must not become the error the user sees.
 */
export async function recordError(report: ErrorReport): Promise<void> {
  try {
    initializeFirebaseAdmin();
    await getFirestore()
      .collection(ERROR_EVENTS)
      .add({
        source: report.source,
        message: clip(report.message, 500) ?? 'Unknown error',
        detail: clip(report.detail, 2000),
        status: report.status ?? null,
        code: clip(report.code, 60),
        stage: clip(report.stage, 200),
        uid: report.uid ?? null,
        email: clip(report.email, 200),
        blogId: clip(report.blogId, 100),
        brandId: clip(report.brandId, 100),
        keyword: clip(report.keyword, 200),
        log: (report.log ?? []).slice(-40).map((line) => String(line).slice(0, 300)),
        context: report.context ?? null,
        createdAt: Timestamp.now(),
      });
  } catch (error) {
    console.error('Could not record error event:', error);
  }
}
