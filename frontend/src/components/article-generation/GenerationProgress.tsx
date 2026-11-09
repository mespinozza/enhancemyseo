'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { STAGES, articleFraction, stageIndex, type StageId } from '@/lib/article/progress';

export interface LiveProgress {
  keyword: string;
  stage: StageId;
  /** When the current stage began, in ms. */
  stageAt: number;
  /** When this article began, in ms. */
  startedAt: number;
  notes: { text: string; at: number }[];
}

/** The steps shown as a checklist; Getting started and Saving are too brief to list. */
const SHOWN = STAGES.filter((s) => s.id !== 'start' && s.id !== 'saving');

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The live card shown while articles are written: which article, the step it is on, a bar
 * that keeps moving between steps, and plain-language notes as the server reports them.
 */
export default function GenerationProgress({
  live,
  completed,
  total,
}: {
  live: LiveProgress | null;
  completed: number;
  total: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const current = live ? articleFraction(live.stage, (now - live.stageAt) / 1000) : 0;
  const overall = total ? Math.min(0.99, (completed + current) / total) : 0;
  const percent = Math.round(overall * 100);
  const reached = live ? stageIndex(live.stage) : 0;
  const elapsed = live ? (now - live.startedAt) / 1000 : 0;
  const stageLabel = live ? STAGES[reached].label : 'Getting started';

  return (
    <div className="sticky top-0 z-10 mb-4 overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-4 text-white shadow-lg sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-blue-200">
            {total > 1 ? `Article ${Math.min(completed + 1, total)} of ${total}` : 'Writing your article'}
          </p>
          <p className="mt-1 truncate text-base font-semibold sm:text-lg" title={live?.keyword}>
            {live?.keyword || 'Preparing…'}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums leading-none">{percent}%</p>
          <p className="mt-1 text-xs tabular-nums text-blue-200">{clock(elapsed)} elapsed</p>
        </div>
      </div>

      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/20">
        <div
          className="relative h-full overflow-hidden rounded-full bg-white transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, percent)}%` }}
        >
          <span
            aria-hidden
            className="absolute inset-0 animate-border-pan bg-[linear-gradient(90deg,transparent,rgba(59,130,246,0.35),transparent)] bg-[length:50%_100%] motion-reduce:hidden"
          />
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Steps">
        {SHOWN.map((stage) => {
          const index = stageIndex(stage.id);
          const done = reached > index;
          const active = reached === index;
          return (
            <li key={stage.id} className="min-w-0">
              <div className={`h-1 rounded-full transition-colors duration-500 ${done ? 'bg-green-300' : active ? 'bg-white' : 'bg-white/20'}`} />
              <p
                className={`mt-1.5 flex items-center gap-1 text-[11px] leading-tight sm:text-xs ${
                  done ? 'text-green-200' : active ? 'font-semibold text-white' : 'text-blue-200/70'
                }`}
              >
                {done && <Check className="h-3 w-3 flex-shrink-0" strokeWidth={3} />}
                {active && <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-white" />}
                <span className="truncate" title={stage.label}>{stage.short}</span>
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg bg-white/10 px-3 py-2.5" aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
          {stageLabel}…
        </p>
        {live && live.notes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {live.notes.slice(-3).map((note, i, shown) => {
              const latest = i === shown.length - 1;
              return (
                <li
                  key={`${note.at}-${note.text}`}
                  className={`flex items-start gap-2 text-xs animate-pick-fade ${latest ? 'text-white' : 'text-blue-200'}`}
                >
                  {latest ? (
                    <span className="mx-[3px] mt-[5px] h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-white" />
                  ) : (
                    <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-300" strokeWidth={3} />
                  )}
                  <span className="min-w-0">{note.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-2 text-[11px] text-blue-200">
        Usually 2 to 3 minutes per article. Keep this tab open while it writes.
      </p>
    </div>
  );
}
