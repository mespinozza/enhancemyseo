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
import SelectionToolbar, { type SelectionTarget } from './SelectionToolbar';
import AiEditPanel, { type AiEditRequest } from './AiEditPanel';
import LinkPanel from './LinkPanel';
import HistoryPanel from './HistoryPanel';

const AUTOSAVE_DELAY_MS = 4000;

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
  const [aiRequest, setAiRequest] = useState<AiEditRequest | null>(null);
  const [revisions, setRevisions] = useState<ArticleRevision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const undoStack = useRef<ArticleBlock[][]>([]);
  const redoStack = useRef<ArticleBlock[][]>([]);
  const savedOriginalRef = useRef(Boolean(originalContent));

  // Positional block ids stay stable because edits replace blocks in place rather
  // than adding or removing them, so a baseline comparison marks what changed.
  const baseline = useMemo(
    () => parseBlocks(originalContent ?? initialContent),
    [originalContent, initialContent],
  );

  const content = useMemo(() => serializeBlocks(blocks), [blocks]);
  const words = useMemo(() => countWords(content), [content]);
  const editableBlocks = useMemo(() => blocks.filter((block) => block.kind !== 'raw'), [blocks]);

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

    // A selection crossing blocks falls back to a whole-block edit of the anchor
    // block, which keeps the "one element at a time" contract intact.
    const crossesBlocks = focusHost !== host;
    const text = active.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({
      blockId,
      text: crossesBlocks ? '' : text,
      top: Math.max(8, rect.top - 46),
      left: Math.max(8, rect.left),
    });
  }, []);

  const openAiForBlock = (blockId: string, selectedText?: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    if (!block) return;

    setAiRequest({
      blockId,
      blockHtml: block.html,
      blockLabel: blockLabel(block),
      selectedText: selectedText || undefined,
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
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
        >
          <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
            <div className="prose prose-sm max-w-none space-y-1">
              {blocks.map((block) => {
                const original = baseline.find((entry) => entry.id === block.id);
                return (
                  <BlockView
                    key={block.id}
                    block={block}
                    isModified={Boolean(original && original.html !== block.html)}
                    onChange={(html) => updateBlock(block.id, html)}
                    onRequestAi={() => openAiForBlock(block.id)}
                    onRevertBlock={() => {
                      if (original) updateBlock(block.id, original.html);
                    }}
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

      {selection && (
        <SelectionToolbar
          target={selection}
          onRewrite={() => openAiForBlock(selection.blockId, selection.text)}
          onDismiss={() => setSelection(null)}
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
            const next = blocks.map((block) =>
              block.id === aiRequest.blockId ? { ...block, html } : block,
            );
            setAiRequest(null);
            await commitWithSnapshot(next, {
              source: 'ai-edit',
              label: description || 'AI edit',
              blockId: aiRequest.blockId,
            });
            toast.success('Edit applied.');
          }}
          onClose={() => setAiRequest(null)}
        />
      )}
    </div>
  );
}
