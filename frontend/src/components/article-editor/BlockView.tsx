'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Sparkles, RotateCcw } from 'lucide-react';
import type { ArticleBlock } from '@/lib/article/blocks';
import { blockLabel } from '@/lib/article/blocks';
import { sanitizeArticleHtml } from '@/lib/article/sanitize';

interface BlockViewProps {
  block: ArticleBlock;
  isModified: boolean;
  isSelected: boolean;
  canRevert: boolean;
  onChange: (html: string) => void;
  onRequestAi: () => void;
  onRevertBlock: () => void;
  onSelect: (extend: boolean) => void;
}

/**
 * Tables carry the key-takeaways rows users most often want to reword, so they get
 * inline editing alongside prose. Chart and callout markup stays display-only in the
 * article flow and is changed through quick edit or AI, where a stray caret cannot
 * mangle it.
 */
function isInlineEditable(block: ArticleBlock): boolean {
  return block.kind === 'prose' || block.tag === 'table';
}

type QuickEditMode = 'standard' | 'html';

export default function BlockView({
  block,
  isModified,
  isSelected,
  canRevert,
  onChange,
  onRequestAi,
  onRevertBlock,
  onSelect,
}: BlockViewProps) {
  const [isQuickEditing, setIsQuickEditing] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickEditMode>('standard');
  const [draft, setDraft] = useState(block.html);

  // Standard mode writes through a ref so typing never re-renders the
  // contentEditable out from under the caret.
  const draftRef = useRef(block.html);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isQuickEditing) return;
    setDraft(block.html);
    draftRef.current = block.html;
  }, [block.html, isQuickEditing]);

  useEffect(() => {
    if (!isQuickEditing || quickMode !== 'standard') return;
    const node = visualRef.current;
    if (node) node.innerHTML = draftRef.current;
  }, [isQuickEditing, quickMode]);

  if (block.kind === 'raw') return null;

  const readDraft = () =>
    quickMode === 'standard' && visualRef.current
      ? visualRef.current.innerHTML
      : draftRef.current;

  const switchMode = (mode: QuickEditMode) => {
    const current = readDraft();
    draftRef.current = current;
    setDraft(current);
    setQuickMode(mode);
  };

  const openQuickEdit = () => {
    draftRef.current = block.html;
    setDraft(block.html);
    setQuickMode('standard');
    setIsQuickEditing(true);
  };

  const frame = isSelected
    ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-300'
    : isModified
      ? 'border-amber-200 bg-amber-50/40'
      : 'border-transparent hover:border-blue-200 hover:bg-blue-50/30';

  return (
    <div
      onMouseDown={(event) => {
        if (event.shiftKey) {
          // Suppressing the default stops the browser starting a native selection
          // that would span editing hosts and fight the block range.
          event.preventDefault();
          onSelect(true);
          return;
        }
        onSelect(false);
      }}
      className={`group relative rounded-lg border transition-colors ${frame}`}
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
          onClick={() => (isQuickEditing ? setIsQuickEditing(false) : openQuickEdit())}
          className={`p-1 hover:text-blue-600 ${isQuickEditing ? 'text-blue-600' : 'text-gray-500'}`}
          title="Quick edit"
        >
          <Pencil size={14} />
        </button>
        {isModified && canRevert && (
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

      {isQuickEditing ? (
        <div className="p-3" onMouseDown={(event) => event.stopPropagation()}>
          <div className="mb-2 flex w-fit items-center gap-0.5 rounded-md bg-gray-100 p-0.5">
            {(['standard', 'html'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchMode(mode)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  quickMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'standard' ? 'Standard' : 'HTML'}
              </button>
            ))}
          </div>

          {quickMode === 'html' ? (
            <textarea
              value={draft}
              onChange={(event) => {
                draftRef.current = event.target.value;
                setDraft(event.target.value);
              }}
              spellCheck={false}
              className="w-full min-h-[160px] font-mono text-xs border border-gray-300 rounded p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div
              ref={visualRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                draftRef.current = visualRef.current?.innerHTML ?? draftRef.current;
              }}
              className="prose prose-sm min-h-[160px] max-w-none overflow-x-auto rounded border border-gray-300 bg-white p-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Both surfaces can introduce markup the generator never produced -
                // hand-written HTML directly, and the browser's own contentEditable
                // output indirectly - so each is sanitized on the way in.
                const next = readDraft();
                if (next.trim()) onChange(sanitizeArticleHtml(next));
                setIsQuickEditing(false);
              }}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                draftRef.current = block.html;
                setDraft(block.html);
                setIsQuickEditing(false);
              }}
              className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
            <span className="text-[11px] text-gray-400">
              {quickMode === 'standard'
                ? 'Editing the rendered content'
                : 'Editing the raw markup'}
            </span>
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
