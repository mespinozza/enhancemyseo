'use client';

import { useState } from 'react';
import { History, RotateCcw, Loader2, Sparkles, Link2, Pencil, FileClock } from 'lucide-react';
import {
  describeSource,
  type ArticleRevision,
  type RevisionSource,
  MAX_REVISIONS,
} from '@/lib/article/revisions';
import DiffView from './DiffView';

interface HistoryPanelProps {
  revisions: ArticleRevision[];
  currentContent: string;
  originalContent: string | null;
  isLoading: boolean;
  onRestore: (revision: ArticleRevision) => void;
  onRestoreOriginal: () => void;
}

function SourceIcon({ source }: { source: RevisionSource }) {
  const size = 13;
  if (source === 'ai-edit') return <Sparkles size={size} className="text-blue-500" />;
  if (source === 'link-swap') return <Link2 size={size} className="text-purple-500" />;
  if (source === 'pre-restore') return <FileClock size={size} className="text-amber-500" />;
  if (source === 'original') return <FileClock size={size} className="text-gray-400" />;
  return <Pencil size={size} className="text-gray-500" />;
}

function formatWhen(revision: ArticleRevision): string {
  const date = revision.createdAt?.toDate?.();
  if (!date) return 'Just now';

  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return date.toLocaleDateString();
}

export default function HistoryPanel({
  revisions,
  currentContent,
  originalContent,
  isLoading,
  onRestore,
  onRestoreOriginal,
}: HistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {originalContent && originalContent !== currentContent && (
        <div className="border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onRestoreOriginal}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <RotateCcw size={13} />
            Revert to the originally generated article
          </button>
        </div>
      )}

      {revisions.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <History className="mx-auto mb-2 text-gray-300" size={24} />
          <p className="text-sm text-gray-500">
            No saved revisions yet. Edits you make will be snapshotted here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {revisions.map((revision) => {
            const isExpanded = expandedId === revision.id;
            const isCurrent = revision.content === currentContent;

            return (
              <div key={revision.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : revision.id)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={revision.source} />
                      <span className="text-sm font-medium text-gray-900">{revision.label}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {describeSource(revision.source)} &middot; {formatWhen(revision)}
                      {isCurrent && ' · matches current'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(revision)}
                    disabled={isCurrent}
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Restore
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      This revision compared to the current draft
                    </p>
                    <DiffView
                      before={revision.content}
                      after={currentContent}
                      emptyMessage="Identical to the current draft."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
        The most recent {MAX_REVISIONS} revisions are kept.
      </p>
    </div>
  );
}
