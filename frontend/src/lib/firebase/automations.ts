/**
 * Client-side reads and writes for automations.
 *
 * Configuration is written straight from the browser with the client SDK, the same way
 * brand profiles are, so there is no CRUD API surface to maintain. Run records are
 * read-only here: they are written by the server, and the security rules enforce that.
 */
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import {
  AUTOMATIONS_COLLECTION,
  AUTOMATION_RUNS_COLLECTION,
  type Automation,
  type AutomationDraft,
  type AutomationRun,
} from '@/lib/automation/types';
import { computeNextRun } from '@/lib/automation/schedule';

export async function listAutomations(uid: string): Promise<Automation[]> {
  const snapshot = await getDocs(
    query(collection(db, AUTOMATIONS_COLLECTION), where('userId', '==', uid), orderBy('createdAt', 'desc'))
  );

  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Automation);
}

export async function createAutomation(uid: string, draft: AutomationDraft): Promise<string> {
  const ref = await addDoc(collection(db, AUTOMATIONS_COLLECTION), {
    ...draft,
    userId: uid,
    nextRunAt: Timestamp.fromDate(computeNextRun(draft.schedule)),
    claimedAt: null,
    lastRunAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Any schedule change recomputes `nextRunAt`, otherwise the automation would keep firing
 * on the old cadence until its next run came around.
 */
export async function updateAutomation(
  automationId: string,
  patch: Partial<AutomationDraft>
): Promise<void> {
  await updateDoc(doc(db, AUTOMATIONS_COLLECTION, automationId), {
    ...patch,
    ...(patch.schedule ? { nextRunAt: Timestamp.fromDate(computeNextRun(patch.schedule)) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setAutomationEnabled(
  automation: Automation,
  enabled: boolean
): Promise<void> {
  await updateDoc(doc(db, AUTOMATIONS_COLLECTION, automation.id as string), {
    enabled,
    // Re-anchor on enable so a long-disabled automation does not fire the instant it is
    // switched back on because its stored `nextRunAt` is in the past.
    ...(enabled ? { nextRunAt: Timestamp.fromDate(computeNextRun(automation.schedule)) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await deleteDoc(doc(db, AUTOMATIONS_COLLECTION, automationId));
}

export async function listRuns(uid: string, count = 25): Promise<AutomationRun[]> {
  const snapshot = await getDocs(
    query(
      collection(db, AUTOMATION_RUNS_COLLECTION),
      where('userId', '==', uid),
      orderBy('startedAt', 'desc'),
      limitTo(count)
    )
  );

  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AutomationRun);
}
