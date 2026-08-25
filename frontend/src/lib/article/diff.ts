import { diffWords } from 'diff';
import { htmlToText } from './blocks';

/**
 * Diffs are computed on visible text rather than raw HTML: comparing markup
 * produces noise from attribute ordering and inline styles that tells a reviewer
 * nothing about what actually changed in the article.
 */

export interface DiffSegment {
  value: string;
  type: 'added' | 'removed' | 'unchanged';
}

export interface DiffSummary {
  segments: DiffSegment[];
  addedWords: number;
  removedWords: number;
  hasChanges: boolean;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export function diffHtml(before: string, after: string): DiffSummary {
  const changes = diffWords(htmlToText(before), htmlToText(after));

  let addedWords = 0;
  let removedWords = 0;

  const segments: DiffSegment[] = changes.map((change) => {
    if (change.added) {
      addedWords += wordCount(change.value);
      return { value: change.value, type: 'added' as const };
    }
    if (change.removed) {
      removedWords += wordCount(change.value);
      return { value: change.value, type: 'removed' as const };
    }
    return { value: change.value, type: 'unchanged' as const };
  });

  return {
    segments,
    addedWords,
    removedWords,
    hasChanges: addedWords > 0 || removedWords > 0,
  };
}
