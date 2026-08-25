'use client';

import { useEffect, useRef, useState } from 'react';
import { Code2, Sparkles, RotateCcw } from 'lucide-react';
import type { ArticleBlock } from '@/lib/article/blocks';
import { blockLabel } from '@/lib/article/blocks';
import { sanitizeArticleHtml } from '@/lib/article/sanitize';

interface BlockViewProps {
  block: ArticleBlock;
  isModified: boolean;
  onChange: (html: string) => void;
  onRequestAi: () => void;
  onRevertBlock: () => void;
}

/**
 * Tables carry the key-takeaways rows users most often want to reword, so they get
 * inline editing alongside prose. Chart and callout markup stays display-only and is
 * changed through the HTML escape hatch or AI, where it cannot be mangled by a caret.
 */
function isInlineEditable(block: ArticleBlock): boolean {
  return block.kind === 'prose' || block.tag === 'table';
}

export default function BlockView({
  block,
  isModified,
  onChange,
  onRequestAi,
  onRevertBlock,
}: BlockViewProps) {
  const [showSource, setShowSource] = useState(false);
  const [draftSource, setDraftSource] = useState(block.html);

  useEffect(() => {
    if (!showSource) setDraftSource(block.html);
  }, [block.html, showSource]);

  if (block.kind === 'raw') return null;

  return (
    <div
      className={`group relative rounded-lg border transition-colors ${
        isModified
          ? 'border-amber-200 bg-amber-50/40'
          : 'border-transparent hover:border-blue-200 hover:bg-blue-50/30'
      }`}
    >
      <div className="absolute -top-3 right-2 z-10 hidden group-hover:flex items-center gap-1 rounded-md border border-gray-200 bg-white shadow-sm px-1 py-0.5">
        <span className="px-1 text-[10px] uppercase tracking-wide text-gray-400">
          {blockLabel(block)}
        </span>
        <button
          type="button"
          onClick={onRequestAi}
          className="p-1 text-gray-500 hover:text-blue-600"
          title="Edit this block with AI"
        >
          <Sparkles size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowSource((value) => !value)}
          className={`p-1 hover:text-blue-600 ${showSource ? 'text-blue-600' : 'text-gray-500'}`}
          title="Edit HTML"
        >
          <Code2 size={14} />
        </button>
        {isModified && (
          <button
            type="button"
            onClick={onRevertBlock}
            className="p-1 text-gray-500 hover:text-amber-600"
            title="Revert this block to the generated version"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {showSource ? (
        <div className="p-3">
          <textarea
            value={draftSource}
            onChange={(event) => setDraftSource(event.target.value)}
            spellCheck={false}
            className="w-full min-h-[160px] font-mono text-xs border border-gray-300 rounded p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Hand-written HTML is the one place a user can introduce markup
                // the generator never produced, so it is sanitized on entry.
                if (draftSource.trim()) onChange(sanitizeArticleHtml(draftSource));
                setShowSource(false);
              }}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Apply HTML
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftSource(block.html);
                setShowSource(false);
              }}
              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isInlineEditable(block) ? (
        <EditableBlock block={block} onChange={onChange} />
      ) : (
        <div
          data-block-id={block.id}
          className="p-2 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      )}
    </div>
  );
}

interface EditableBlockProps {
  block: ArticleBlock;
  onChange: (html: string) => void;
}

/**
 * The contentEditable host wraps the block element rather than replacing it, so the
 * element's own tag and inline style attributes survive editing untouched.
 *
 * React must not re-render the subtree while it holds focus or the caret resets, so
 * the DOM is written imperatively and changes commit on blur.
 */
function EditableBlock({ block, onChange }: EditableBlockProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (document.activeElement === node) return;
    if (node.innerHTML !== block.html) node.innerHTML = block.html;
  }, [block.html]);

  const commit = () => {
    const node = ref.current;
    if (!node) return;

    const next = node.innerHTML;

    // Guard against the wrapper being emptied out by a select-all delete.
    if (!next.trim()) {
      node.innerHTML = block.html;
      return;
    }

    if (next !== block.html) onChange(next);
  };

  return (
    <div
      ref={ref}
      data-block-id={block.id}
      data-editable-block="true"
      contentEditable
      suppressContentEditableWarning
      onBlur={commit}
      onKeyDown={(event) => {
        // Enter would split the element and break the one-element-per-block model.
        if (event.key === 'Enter') event.preventDefault();
      }}
      className="p-2 rounded outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white overflow-x-auto"
    />
  );
}
