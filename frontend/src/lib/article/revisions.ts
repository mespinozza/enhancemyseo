import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * Revisions are full HTML snapshots in a subcollection rather than deltas on the
 * article document: articles are small, restore stays trivial, and a Firestore
 * document caps at 1MB which a revision array would eventually breach.
 */

export type RevisionSource = 'original' | 'manual' | 'ai-edit' | 'link-swap' | 'pre-restore';

export interface ArticleRevision {
  id: string;
  userId: string;
  content: string;
  createdAt: Timestamp | null;
  source: RevisionSource;
  label: string;
  blockId?: string;
}

/** Keeping this unbounded would grow storage forever across every article. */
export const MAX_REVISIONS = 30;

function revisionsRef(blogId: string) {
  return collection(db, 'blogs', blogId, 'revisions');
}

export interface CreateRevisionInput {
  content: string;
  source: RevisionSource;
  label: string;
  blockId?: string;
}

export async function createRevision(
  uid: string,
  blogId: string,
  input: CreateRevisionInput,
): Promise<void> {
  await addDoc(revisionsRef(blogId), {
    userId: uid,
    content: input.content,
    source: input.source,
    label: input.label,
    ...(input.blockId ? { blockId: input.blockId } : {}),
    createdAt: serverTimestamp(),
  });

  await pruneRevisions(blogId);
}

export async function listRevisions(blogId: string): Promise<ArticleRevision[]> {
  const snapshot = await getDocs(query(revisionsRef(blogId), orderBy('createdAt', 'desc')));

  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      userId: data.userId,
      content: data.content ?? '',
      createdAt: data.createdAt ?? null,
      source: (data.source ?? 'manual') as RevisionSource,
      label: data.label ?? 'Edited',
      blockId: data.blockId,
    };
  });
}

async function pruneRevisions(blogId: string): Promise<void> {
  const snapshot = await getDocs(query(revisionsRef(blogId), orderBy('createdAt', 'desc')));
  if (snapshot.docs.length <= MAX_REVISIONS) return;

  const stale = snapshot.docs.slice(MAX_REVISIONS);
  await Promise.all(stale.map((entry) => deleteDoc(doc(revisionsRef(blogId), entry.id))));
}

/**
 * Revision writes land in a subcollection that needs its own security rule. Without
 * it deployed, Firestore denies the write while ordinary article saves keep working,
 * so the distinction has to be spelled out rather than surfaced as a failed save.
 */
export function describeRevisionFailure(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : '';

  if (code === 'permission-denied' || /insufficient permissions/i.test(message)) {
    return 'Revision history is turned off until the Firestore rule for blogs/{id}/revisions is deployed. Your edits are still saving normally.';
  }

  return 'Revision history is temporarily unavailable. Your edits are still saving normally.';
}

export function describeSource(source: RevisionSource): string {
  switch (source) {
    case 'original':
      return 'As generated';
    case 'ai-edit':
      return 'AI edit';
    case 'link-swap':
      return 'Link change';
    case 'pre-restore':
      return 'Before restore';
    default:
      return 'Manual edit';
  }
}
