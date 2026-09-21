'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  Copy,
  Download,
  Link2,
  History,
  ListTree,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { blogOperations, type BrandProfile } from '@/lib/firebase/firestore';
import {
  parseBlocks,
  serializeBlocks,
  prefixBlockIds,
  countWords,
  blockLabel,
  type ArticleBlock,
} from '@/lib/article/blocks';
import { rewriteBlockLink, type ArticleLink } from '@/lib/article/links';
import {
  createRevision,
  listRevisions,
  describeRevisionFailure,
  type ArticleRevision,
  type RevisionSource,
} from '@/lib/article/revisions';
import BlockView from './BlockView';
import BlockSelectionBar from './BlockSelectionBar';
import SelectionToolbar, { type SelectionTarget } from './SelectionToolbar';
import AiEditPanel, { type AiEditRequest } from './AiEditPanel';
import LinkPanel from './LinkPanel';
import HistoryPanel from './HistoryPanel';

const AUTOSAVE_DELAY_MS = 4000;

/** Anchor and focus of a whole-block selection; the range between them is derived. */
interface BlockRange {
  anchorId: string;
  focusId: string;
}

/**
 * True when the caret sits against the leading (up) or trailing (down) edge of its
 * block, meaning the browser has nowhere further to extend a text selection inside
 * this editing host and Shift+Arrow should start taking whole blocks instead.
 */
function isCaretAtBlockEdge(direction: 1 | -1): boolean {
  const active = window.getSelection();
  if (!active || active.rangeCount === 0 || !active.focusNode) return true;

  const focusElement =
    active.focusNode instanceof Element
      ? active.focusNode
      : active.focusNode.parentElement;
  const host = focusElement?.closest('[data-block-id]');
  if (!host) return true;

  const probe = document.createRange();
  probe.setStart(active.focusNode, active.focusOffset);
  probe.collapse(true);

  const bounds = document.createRange();
  bounds.selectNodeContents(host);

  return direction === -1
    ? probe.compareBoundaryPoints(Range.START_TO_START, bounds) <= 0
    : probe.compareBoundaryPoints(Range.END_TO_END, bounds) >= 0;
}

interface ArticleEditorProps {
  uid: string;
  blogId: string;
  initialTitle: string;
  initialContent: string;
  originalContent: string | null;
  brand: BrandProfile | null;
  keyword?: string;
  toneOfVoice?: string;
  getToken: () => Promise<string | null>;
}

type RightTab = 'links' | 'history' | 'outline';

interface Snapshot {
  source: RevisionSource;
  label: string;
  blockId?: string;
}

export default function ArticleEditor({
  uid,
  blogId,
  initialTitle,
  initialContent,
  originalContent,
  brand,
  keyword,
  toneOfVoice,
  getToken,
}: ArticleEditorProps) {
  const router = useRouter();

  const [blocks, setBlocks] = useState<ArticleBlock[]>(() => parseBlocks(initialContent));
  const [title, setTitle] = useState(initialTitle);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('links');
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const [blockRange, setBlockRange] = useState<BlockRange | null>(null);
  const [aiRequest, setAiRequest] = useState<AiEditRequest | null>(null);
  const [revisions, setRevisions] = useState<ArticleRevision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const undoStack = useRef<ArticleBlock[][]>([]);
  const redoStack = useRef<ArticleBlock[][]>([]);
  const savedOriginalRef = useRef(Boolean(originalContent));
  const lastTouchedBlockRef = useRef<string | null>(null);
  const sectionSeqRef = useRef(0);

  // Keyed by block id rather than position, because a multi-block rewrite can change
  // how many blocks exist. A null entry marks a block the AI created, which is
  // flagged as changed but has no earlier version to revert to.
  const [baseline, setBaseline] = useState<Map<string, string | null>>(() => {
    const current = parseBlocks(initialContent);
    const generated = originalContent ? parseBlocks(originalContent) : null;

    // Positional ids line up with the generated version only while the block counts
    // match. Once a structural edit has been saved they don't, and comparing across
    // the offset would mark untouched blocks as changed and revert them to the wrong
    // text - so per-block revert falls back to the state the editor opened in. The
    // generated version is still reachable from the History panel.
    const source =
      generated && generated.length === current.length ? generated : current;

    const map = new Map<string, string | null>();
    for (const block of source) map.set(block.id, block.html);
    return map;
  });

  const content = useMemo(() => serializeBlocks(blocks), [blocks]);
  const words = useMemo(() => countWords(content), [content]);
  const editableBlocks = useMemo(() => blocks.filter((block) => block.kind !== 'raw'), [blocks]);

  const selectedBlockIds = useMemo(() => {
    if (!blockRange) return [];
    const anchorIndex = blocks.findIndex((block) => block.id === blockRange.anchorId);
    const focusIndex = blocks.findIndex((block) => block.id === blockRange.focusId);
    if (anchorIndex === -1 || focusIndex === -1) return [];

    const [start, end] =
      anchorIndex <= focusIndex ? [anchorIndex, focusIndex] : [focusIndex, anchorIndex];

    return blocks
      .slice(start, end + 1)
      .filter((block) => block.kind !== 'raw')
      .map((block) => block.id);
  }, [blockRange, blocks]);

  const selectedWords = useMemo(() => {
    if (selectedBlockIds.length < 2) return 0;
    return countWords(
      blocks
        .filter((block) => selectedBlockIds.includes(block.id))
        .map((block) => block.html)
        .join(' '),
    );
  }, [selectedBlockIds, blocks]);

  const refreshRevisions = useCallback(async () => {
    try {
      setRevisions(await listRevisions(blogId));
      setHistoryError(null);
    } catch (error) {
      console.error('Could not load revisions:', error);
      setHistoryError(describeRevisionFailure(error));
    } finally {
      setIsLoadingRevisions(false);
    }
  }, [blogId]);

  useEffect(() => {
    refreshRevisions();
  }, [refreshRevisions]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const persist = useCallback(
    async (nextBlocks: ArticleBlock[], nextTitle: string, snapshot?: Snapshot) => {
      const nextContent = serializeBlocks(nextBlocks);
      setIsSaving(true);

      try {
        await blogOperations.updateBlog(uid, blogId, {
          content: nextContent,
          title: nextTitle,
          hasManualEdits: true,
          ...(savedOriginalRef.current ? {} : { originalContent: initialContent }),
        });
        savedOriginalRef.current = true;
        setIsDirty(false);
        setSavedAt(new Date());
      } catch (error) {
        console.error('Failed to save article:', error);
        toast.error('Could not save your changes.');
        setIsSaving(false);
        return false;
      }

      // The article is already saved at this point. A snapshot failure costs the
      // user their revision history, not their edit, so it must not be reported
      // as a failed save.
      if (snapshot) {
        try {
          await createRevision(uid, blogId, {
            content: nextContent,
            source: snapshot.source,
            label: snapshot.label,
            blockId: snapshot.blockId,
          });
          await refreshRevisions();
        } catch (error) {
          console.error('Saved the article but could not record a revision:', error);
          setHistoryError(describeRevisionFailure(error));
        }
      }

      setIsSaving(false);
      return true;
    },
    [uid, blogId, initialContent, refreshRevisions],
  );

  const applyBlocks = useCallback((next: ArticleBlock[]) => {
    setBlocks((current) => {
      undoStack.current.push(current);
      redoStack.current = [];
      return next;
    });
    setIsDirty(true);
  }, []);

  const updateBlock = useCallback(
    (blockId: string, html: string) => {
      applyBlocks(
        blocks.map((block) => (block.id === blockId ? { ...block, html } : block)),
      );
    },
    [applyBlocks, blocks],
  );

  /** AI edits and link swaps persist immediately so the snapshot matches what is stored. */
  const commitWithSnapshot = useCallback(
    async (nextBlocks: ArticleBlock[], snapshot: Snapshot) => {
      undoStack.current.push(blocks);
      redoStack.current = [];
      setBlocks(nextBlocks);
      await persist(nextBlocks, title, snapshot);
    },
    [blocks, persist, title],
  );

  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(blocks);
    setBlocks(previous);
    setIsDirty(true);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(blocks);
    setBlocks(next);
    setIsDirty(true);
  };

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const timer = setTimeout(() => {
      persist(blocks, title);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, isSaving, blocks, title, persist]);

  const captureSelection = useCallback(() => {
    const active = window.getSelection();
    if (!active || active.isCollapsed || active.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const range = active.getRangeAt(0);
    const anchorElement =
      active.anchorNode instanceof Element
        ? active.anchorNode
        : active.anchorNode?.parentElement ?? null;
    const host = anchorElement?.closest('[data-block-id]');
    if (!host) {
      setSelection(null);
      return;
    }

    const blockId = host.getAttribute('data-block-id');
    if (!blockId) {
      setSelection(null);
      return;
    }

    const focusElement =
      active.focusNode instanceof Element
        ? active.focusNode
        : active.focusNode?.parentElement ?? null;
    const focusHost = focusElement?.closest('[data-block-id]');
    const focusId = focusHost?.getAttribute('data-block-id');

    // Dragging across blocks can't produce a coherent partial-text edit spanning
    // separate editing hosts, so it promotes to a whole-block range instead.
    if (focusId && focusId !== blockId) {
      setSelection(null);
      setBlockRange({ anchorId: blockId, focusId });
      active.removeAllRanges();
      return;
    }

    const text = active.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({
      blockId,
      text,
      top: Math.max(8, rect.top - 46),
      left: Math.max(8, rect.left),
    });
  }, []);

  const selectBlock = useCallback((blockId: string, extend: boolean) => {
    if (!extend) {
      lastTouchedBlockRef.current = blockId;
      setBlockRange(null);
      return;
    }

    setBlockRange((current) => ({
      anchorId: current?.anchorId ?? lastTouchedBlockRef.current ?? blockId,
      focusId: blockId,
    }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  /** Walks the focus end of the block range one editable block up or down. */
  const extendBlockRange = useCallback(
    (direction: 1 | -1) => {
      const editableIds = blocks
        .filter((block) => block.kind !== 'raw')
        .map((block) => block.id);

      setBlockRange((current) => {
        const anchorId = current?.anchorId ?? lastTouchedBlockRef.current;
        const focusId = current?.focusId ?? lastTouchedBlockRef.current;
        if (!anchorId || !focusId) return current;

        const index = editableIds.indexOf(focusId);
        const nextIndex = index + direction;
        if (index === -1 || nextIndex < 0 || nextIndex >= editableIds.length) {
          return current ?? { anchorId, focusId };
        }

        return { anchorId, focusId: editableIds[nextIndex] };
      });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    },
    [blocks],
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBlockRange(null);
        setSelection(null);
        return;
      }

      if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;

      const direction = event.key === 'ArrowDown' ? 1 : -1;

      // Once a block range exists, Shift+Arrow belongs to it. Before that, the
      // browser keeps its normal text selection until the caret hits the block edge.
      if (selectedBlockIds.length === 0 && !isCaretAtBlockEdge(direction)) return;
      if (!blockRange && !lastTouchedBlockRef.current) return;

      event.preventDefault();
      extendBlockRange(direction);
    },
    [selectedBlockIds.length, blockRange, extendBlockRange],
  );

  const openAiForBlock = (blockId: string, selectedText?: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    if (!block) return;

    setAiRequest({
      blockIds: [blockId],
      blockHtml: block.html,
      blockLabel: blockLabel(block),
      selectedText: selectedText || undefined,
    });
    setSelection(null);
  };

  /** Sends the contiguous span from the first to the last selected block as one unit. */
  const openAiForSelection = () => {
    if (selectedBlockIds.length < 2) return;

    const startIndex = blocks.findIndex((block) => block.id === selectedBlockIds[0]);
    const endIndex = blocks.findIndex(
      (block) => block.id === selectedBlockIds[selectedBlockIds.length - 1],
    );
    if (startIndex === -1 || endIndex === -1) return;

    setAiRequest({
      blockIds: [...selectedBlockIds],
      blockHtml: serializeBlocks(blocks.slice(startIndex, endIndex + 1)),
      blockLabel: `${selectedBlockIds.length} blocks`,
    });
    setSelection(null);
  };

  const focusBlock = (blockId: string) => {
    const node = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('ring-2', 'ring-amber-400');
    setTimeout(() => node.classList.remove('ring-2', 'ring-amber-400'), 1600);
  };

  const handleLinkSwap = async (link: ArticleLink, href: string, anchorText?: string) => {
    const target = blocks.find((block) => block.id === link.blockId);
    if (!target) return;

    const nextHtml = rewriteBlockLink(target.html, link.occurrence, { href, anchorText });
    const next = blocks.map((block) =>
      block.id === link.blockId ? { ...block, html: nextHtml } : block,
    );

    await commitWithSnapshot(next, {
      source: 'link-swap',
      label: `Relinked ${link.kind}`,
      blockId: link.blockId,
    });
    toast.success('Link updated.');
    focusBlock(link.blockId);
  };

  const handleRestore = async (revision: ArticleRevision) => {
    const restored = parseBlocks(revision.content);

    // Snapshot the current state first so restoring is itself reversible.
    await persist(blocks, title, { source: 'pre-restore', label: 'Before restore' });

    undoStack.current.push(blocks);
    redoStack.current = [];
    setBlocks(restored);
    await persist(restored, title, { source: 'manual', label: `Restored ${revision.label}` });
    toast.success('Revision restored.');
  };

  const handleRestoreOriginal = async () => {
    if (!originalContent) return;
    await handleRestore({
      id: 'original',
      userId: uid,
      content: originalContent,
      createdAt: null,
      source: 'original',
      label: 'the generated version',
    });
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Article HTML copied to clipboard.');
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'article'}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  };

  const saveState = isSaving
    ? 'Saving...'
    : isDirty
      ? 'Unsaved changes'
      : savedAt
        ? `Saved ${savedAt.toLocaleTimeString()}`
        : 'No changes yet';

  // The dashboard layout has no top bar and already sizes its main area to the
  // viewport, so the editor fills its container instead of subtracting a chrome
  // height that would leave dead space below it.
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setIsDirty(true);
          }}
          className="min-w-[200px] flex-1 rounded border border-transparent px-2 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-300 focus:border-blue-400 focus:outline-none"
        />

        <div className="flex items-center gap-1 text-xs text-gray-500">
          {isSaving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : !isDirty && savedAt ? (
            <CheckCircle2 size={13} className="text-green-500" />
          ) : null}
          <span>{saveState}</span>
          <span className="mx-1 text-gray-300">|</span>
          <span>{words} words</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded"
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={redo}
            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded"
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            onClick={copyHtml}
            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded"
            title="Copy HTML"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={downloadHtml}
            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded"
            title="Download HTML"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={() => persist(blocks, title, { source: 'manual', label: 'Manual edit' })}
            disabled={isSaving}
            className="ml-1 flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={15} />
            Save
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main
          className="flex-1 overflow-y-auto bg-gray-50 px-4 py-6"
          onMouseUp={captureSelection}
          onKeyUp={captureSelection}
          onKeyDown={handleEditorKeyDown}
        >
          <p className="mx-auto mb-2 max-w-3xl text-xs text-gray-400">
            Highlight text to rewrite a passage. Shift+click another block, or Shift+Arrow
            from a block edge, to edit several blocks together.
          </p>
          <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
            <div className="prose prose-sm max-w-none space-y-1">
              {blocks.map((block) => {
                const baselineHtml = baseline.get(block.id);
                const canRevert = typeof baselineHtml === 'string';
                const isNew = baseline.has(block.id) && baselineHtml === null;
                return (
                  <BlockView
                    key={block.id}
                    block={block}
                    isModified={isNew || (canRevert && baselineHtml !== block.html)}
                    isSelected={selectedBlockIds.includes(block.id)}
                    canRevert={canRevert}
                    onChange={(html) => updateBlock(block.id, html)}
                    onRequestAi={() => openAiForBlock(block.id)}
                    onRevertBlock={() => {
                      if (canRevert) updateBlock(block.id, baselineHtml);
                    }}
                    onSelect={(extend) => selectBlock(block.id, extend)}
                  />
                );
              })}
            </div>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-gray-200 bg-white lg:flex">
          <div className="flex border-b border-gray-200">
            {(
              [
                { id: 'links' as const, label: 'Links', icon: Link2 },
                { id: 'history' as const, label: 'History', icon: History },
                { id: 'outline' as const, label: 'Outline', icon: ListTree },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors ${
                  rightTab === tab.id
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === 'links' && (
              <LinkPanel
                blocks={blocks}
                brand={brand}
                getToken={getToken}
                onSwap={handleLinkSwap}
                onFocusBlock={focusBlock}
              />
            )}
            {rightTab === 'history' && (
              <HistoryPanel
                revisions={revisions}
                currentContent={content}
                originalContent={originalContent}
                isLoading={isLoadingRevisions}
                error={historyError}
                onRestore={handleRestore}
                onRestoreOriginal={handleRestoreOriginal}
              />
            )}
            {rightTab === 'outline' && (
              <div className="h-full overflow-y-auto py-2">
                {editableBlocks.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => focusBlock(block.id)}
                    className="block w-full px-4 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-blue-600"
                  >
                    <span className="mr-2 text-[10px] uppercase tracking-wide text-gray-400">
                      {blockLabel(block)}
                    </span>
                    <span className="line-clamp-1">{block.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 60)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {selection && selectedBlockIds.length < 2 && (
        <SelectionToolbar
          target={selection}
          onRewrite={() => openAiForBlock(selection.blockId, selection.text)}
          onDismiss={() => setSelection(null)}
        />
      )}

      {selectedBlockIds.length >= 2 && (
        <BlockSelectionBar
          count={selectedBlockIds.length}
          words={selectedWords}
          onRewrite={openAiForSelection}
          onClear={() => setBlockRange(null)}
        />
      )}

      {aiRequest && (
        <AiEditPanel
          request={aiRequest}
          blogId={blogId}
          brand={{
            brandName: brand?.brandName,
            businessType: brand?.businessType,
            toneOfVoice,
            keyword,
          }}
          getToken={getToken}
          onApply={async (html, description) => {
            const ids = aiRequest.blockIds;
            setAiRequest(null);
            setBlockRange(null);

            if (ids.length === 1) {
              const next = blocks.map((block) =>
                block.id === ids[0] ? { ...block, html } : block,
              );
              await commitWithSnapshot(next, {
                source: 'ai-edit',
                label: description || 'AI edit',
                blockId: ids[0],
              });
              toast.success('Edit applied.');
              return;
            }

            const startIndex = blocks.findIndex((block) => block.id === ids[0]);
            const endIndex = blocks.findIndex((block) => block.id === ids[ids.length - 1]);
            if (startIndex === -1 || endIndex === -1) {
              toast.error('Those blocks are no longer in the article.');
              return;
            }

            const replacement = prefixBlockIds(
              parseBlocks(html),
              `s${sectionSeqRef.current++}-`,
            );

            setBaseline((current) => {
              const next = new Map(current);
              for (const block of replacement) {
                if (!next.has(block.id)) next.set(block.id, null);
              }
              return next;
            });

            await commitWithSnapshot(
              [...blocks.slice(0, startIndex), ...replacement, ...blocks.slice(endIndex + 1)],
              { source: 'ai-edit', label: description || `AI edit of ${ids.length} blocks` },
            );
            toast.success(`Rewrote ${ids.length} blocks.`);
          }}
          onClose={() => setAiRequest(null)}
        />
      )}
    </div>
  );
}
