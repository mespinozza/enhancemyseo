'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Pin, PinOff, X } from 'lucide-react';

interface PeekPanelProps {
  /** Remembers "keep open" per panel, e.g. "tone-sample". */
  id: string;
  title: string;
  /** Changes when the user picks something; each change opens the panel again. */
  peekKey: string;
  /** Border and background classes for the card. */
  accent: string;
  /** How long it stays before folding away, unless pinned or hovered. */
  holdMs?: number;
  /** False renders nothing while staying mounted, so the next pick still opens it. */
  show?: boolean;
  children: ReactNode;
}

const storageKey = (id: string) => `peek-pinned:${id}`;

/**
 * A details card that opens when a choice is made, then folds away after a few seconds
 * so the form stays short. Hovering or focusing it pauses the countdown; the pin keeps it
 * open (remembered on this device) and the toggle brings it back.
 */
export default function PeekPanel({ id, title, peekKey, accent, holdMs = 5000, show = true, children }: PeekPanelProps) {
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  // Opened by a pick, so it folds itself away; opened by hand, it waits to be closed.
  const [auto, setAuto] = useState(false);
  // Bumped to restart the countdown animation on every new pick.
  const [run, setRun] = useState(0);
  const lastKey = useRef(peekKey);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey(id)) === '1';
    setPinned(saved);
    if (saved) setOpen(true);
  }, [id]);

  useEffect(() => {
    // Only a pick opens it; loading a saved value does not.
    if (lastKey.current === peekKey) return;
    lastKey.current = peekKey;
    setOpen(true);
    setAuto(true);
    setRun((n) => n + 1);
  }, [peekKey]);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    setRun((n) => n + 1);
    window.localStorage.setItem(storageKey(id), next ? '1' : '0');
  };

  const close = () => {
    setOpen(false);
    if (pinned) {
      setPinned(false);
      window.localStorage.setItem(storageKey(id), '0');
    }
  };

  if (!show) return null;

  return (
    <div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <div className={`group relative overflow-hidden rounded-lg border-l-4 px-3 py-2 ${accent}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
              <div className="-mr-1 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={togglePin}
                  tabIndex={open ? 0 : -1}
                  title={pinned ? 'Let it fold away' : 'Keep open'}
                  aria-label={pinned ? `Stop keeping ${title} open` : `Keep ${title} open`}
                  aria-pressed={pinned}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-black/5 ${
                    pinned ? 'font-medium text-gray-700' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  {pinned ? 'Kept open' : 'Keep open'}
                </button>
                <button
                  type="button"
                  onClick={close}
                  tabIndex={open ? 0 : -1}
                  aria-label={`Hide ${title}`}
                  title="Hide"
                  className="rounded p-0.5 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {children}
            {open && auto && !pinned && (
              // The countdown drives the fold: it pauses while the card is hovered or focused.
              <span
                key={run}
                aria-hidden
                onAnimationEnd={() => setOpen(false)}
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-peek-countdown bg-current opacity-20 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
                style={{ animationDuration: `${holdMs}ms` }}
              />
            )}
          </div>
        </div>
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => {
            setAuto(false);
            setOpen(true);
          }}
          className="flex animate-pick-fade items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
          aria-expanded={false}
        >
          {title}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
