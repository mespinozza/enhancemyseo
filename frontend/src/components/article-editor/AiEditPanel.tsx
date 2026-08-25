'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X, Loader2, Check, RefreshCw } from 'lucide-react';
import { EDIT_PRESETS, type BrandContext } from '@/lib/article/rewrite';
import { sanitizeArticleHtml } from '@/lib/article/sanitize';
import DiffView from './DiffView';

export interface AiEditRequest {
  blockId: string;
  blockHtml: string;
  blockLabel: string;
  selectedText?: string;
}

interface AiEditPanelProps {
  request: AiEditRequest;
  blogId: string;
  brand: BrandContext;
  getToken: () => Promise<string | null>;
  onApply: (html: string, description: string) => void;
  onClose: () => void;
}

export default function AiEditPanel({
  request,
  blogId,
  brand,
  getToken,
  onApply,
  onClose,
}: AiEditPanelProps) {
  const [presetId, setPresetId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [lastDescription, setLastDescription] = useState('');

  useEffect(() => {
    setPresetId(null);
    setInstruction('');
    setResult(null);
    setError(null);
  }, [request.blockId, request.selectedText]);

  const run = async () => {
    const preset = presetId ? EDIT_PRESETS.find((entry) => entry.id === presetId) : undefined;
    const freeText = instruction.trim();

    if (!preset && !freeText) {
      setError('Pick a preset or describe the change you want.');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('You are not signed in.');

      const response = await fetch('/api/article/edit-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          blogId,
          blockHtml: request.blockHtml,
          selectedText: request.selectedText,
          presetId: preset?.id,
          instruction: freeText || undefined,
          brand,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The edit could not be generated.');

      setResult(sanitizeArticleHtml(payload.html));
      setLastDescription(preset ? preset.label : freeText.slice(0, 60));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The edit could not be generated.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-blue-600" size={18} />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit with AI</h2>
              <p className="text-xs text-gray-500">
                {request.selectedText
                  ? 'Rewriting the highlighted passage'
                  : `Rewriting the whole ${request.blockLabel.toLowerCase()}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {request.selectedText && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Selected text
              </h3>
              <blockquote className="rounded border-l-4 border-blue-400 bg-blue-50 px-3 py-2 text-sm text-gray-700">
                {request.selectedText}
              </blockquote>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Quick edits
            </h3>
            <div className="flex flex-wrap gap-2">
              {EDIT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  onClick={() => setPresetId(presetId === preset.id ? null : preset.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    presetId === preset.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Or describe the change
            </h3>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="e.g. make this sound less salesy and mention that reset behavior varies by model"
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              A preset and your own instruction can be combined; the preset takes priority.
            </p>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={isRunning}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isRunning ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating edit...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {result ? 'Regenerate' : 'Generate edit'}
              </>
            )}
          </button>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  What changed
                </h3>
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <DiffView
                    before={request.blockHtml}
                    after={result}
                    emptyMessage="The AI returned the passage unchanged."
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Preview
                </h3>
                <div
                  className="prose prose-sm max-w-none rounded border border-gray-200 p-3"
                  dangerouslySetInnerHTML={{ __html: result }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          {result && (
            <>
              <button
                type="button"
                onClick={run}
                disabled={isRunning}
                className="flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              >
                <RefreshCw size={14} />
                Try again
              </button>
              <button
                type="button"
                onClick={() => onApply(result, lastDescription || 'AI edit')}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
              >
                <Check size={15} />
                Accept edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
