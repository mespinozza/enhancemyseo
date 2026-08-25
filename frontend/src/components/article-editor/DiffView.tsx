'use client';

import { useMemo } from 'react';
import { diffHtml } from '@/lib/article/diff';

interface DiffViewProps {
  before: string;
  after: string;
  emptyMessage?: string;
}

export default function DiffView({ before, after, emptyMessage }: DiffViewProps) {
  const summary = useMemo(() => diffHtml(before, after), [before, after]);

  if (!summary.hasChanges) {
    return (
      <p className="text-sm text-gray-500 italic">
        {emptyMessage ?? 'No visible text changes.'}
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs">
        <span className="text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
          +{summary.addedWords} added
        </span>
        <span className="text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
          −{summary.removedWords} removed
        </span>
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {summary.segments.map((segment, index) => {
          if (segment.type === 'added') {
            return (
              <span key={index} className="bg-green-100 text-green-900 rounded px-0.5">
                {segment.value}
              </span>
            );
          }
          if (segment.type === 'removed') {
            return (
              <span key={index} className="bg-red-100 text-red-900 line-through rounded px-0.5">
                {segment.value}
              </span>
            );
          }
          return <span key={index} className="text-gray-700">{segment.value}</span>;
        })}
      </div>
    </div>
  );
}
