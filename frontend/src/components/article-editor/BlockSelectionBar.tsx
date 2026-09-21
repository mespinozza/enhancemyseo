'use client';

import { Sparkles, X } from 'lucide-react';

interface BlockSelectionBarProps {
  count: number;
  words: number;
  onRewrite: () => void;
  onClear: () => void;
}

export default function BlockSelectionBar({
  count,
  words,
  onRewrite,
  onClear,
}: BlockSelectionBarProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-xl"
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className="pl-1 text-xs font-medium text-gray-700">
        {count} blocks selected
        <span className="ml-1.5 font-normal text-gray-400">{words} words</span>
      </span>
      <button
        type="button"
        onClick={onRewrite}
        className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <Sparkles size={13} />
        Edit with AI
      </button>
      <button
        type="button"
        onClick={onClear}
        className="p-1 text-gray-400 hover:text-gray-600"
        title="Clear selection (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
