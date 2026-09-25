import { App, cert, getApps, initializeApp } from 'firebase-admin/app';

/**
 * Service account credentials come from the environment, never from source. An earlier
 * version of this file carried a real private key as a development fallback, which meant
 * a full-privilege credential sat in a public repository. Missing configuration now
 * fails loudly instead of silently starting with someone else's key.
 */
const MISSING_CONFIG =
  'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and ' +
  'FIREBASE_PRIVATE_KEY in your environment (frontend/.env locally, Railway variables in ' +
  'production).';

export function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    // Several modules call this at import time, so a throw here would fail `next build`
    // on a machine that only holds runtime secrets. Build with no credential at all:
    // importing succeeds, and any real call still fails rather than reading live data.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.warn(`${MISSING_CONFIG} Continuing without credentials for the build only.`);
      return initializeApp({ projectId: projectId || 'unconfigured' });
    }
    throw new Error(MISSING_CONFIG);
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // Railway and .env files store the key with escaped newlines.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  });
}
