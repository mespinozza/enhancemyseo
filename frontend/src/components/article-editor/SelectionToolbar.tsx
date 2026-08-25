'use client';

import { Sparkles, X } from 'lucide-react';

export interface SelectionTarget {
  blockId: string;
  text: string;
  top: number;
  left: number;
}

interface SelectionToolbarProps {
  target: SelectionTarget;
  onRewrite: () => void;
  onDismiss: () => void;
}

export default function SelectionToolbar({ target, onRewrite, onDismiss }: SelectionToolbarProps) {
  const words = target.text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div
      className="fixed z-40 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-lg"
      style={{ top: target.top, left: target.left }}
      // Keeps the browser selection alive when the toolbar is clicked.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onRewrite}
        className="flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        <Sparkles size={13} />
        Rewrite with AI
      </button>
      <span className="text-[11px] text-gray-400">
        {words} {words === 1 ? 'word' : 'words'}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="p-0.5 text-gray-400 hover:text-gray-600"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
