'use client';

import { useCallback, useRef } from 'react';

/** Long enough for one smooth scroll to finish, so a trackpad swipe moves one page, not five. */
const PAGE_LOCK_MS = 380;

export const OPTIONS_PER_PAGE = 3;
/**
 * Picker panels. Every option is the same height, so the panel shows exactly
 * OPTIONS_PER_PAGE of them and each wheel turn lands on a clean page: 18.75rem is three
 * 6rem rows plus padding. `!` beats the max-height the anchor sets inline; the
 * anchor's own limit still keeps it inside the viewport.
 */
export const PANEL_CLASS =
  'z-50 !max-h-[min(18.75rem,var(--anchor-max-height,100vh))] w-[var(--button-width)] min-w-[20rem] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 transition duration-150 ease-out focus:outline-none data-[closed]:-translate-y-1 data-[closed]:scale-[0.98] data-[closed]:opacity-0';
export const OPTION_CLASS =
  'group flex h-24 shrink-0 cursor-pointer gap-3 overflow-hidden rounded-lg px-2.5 py-2 transition-colors duration-150 data-[focus]:bg-gray-50 data-[selected]:bg-blue-50/70';

/**
 * A callback ref for a listbox panel: each wheel turn glides to the next (or previous)
 * `perPage` options instead of scrolling freely. Keyboard and scrollbar scrolling are
 * left as they are.
 */
export function usePagedWheel<T extends HTMLElement>(perPage = 3) {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback(
    (panel: T | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!panel) return;

      let lockedUntil = 0;
      const onWheel = (event: WheelEvent) => {
        if (Math.abs(event.deltaY) < 2 || panel.scrollHeight <= panel.clientHeight) return;
        event.preventDefault();
        const now = Date.now();
        if (now < lockedUntil) return;

        const options = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
        if (!options.length) return;
        const padding = parseFloat(getComputedStyle(panel).paddingTop) || 0;
        const top = panel.scrollTop + padding;
        const current = Math.max(0, options.findIndex((option) => option.offsetTop >= top - 2));
        // Pages start at multiples of perPage, so the last page clamped to the bottom
        // still steps back to the same pages it came from.
        const page = event.deltaY > 0 ? Math.floor(current / perPage) + 1 : Math.ceil(current / perPage) - 1;
        const next = Math.min(options.length - 1, Math.max(0, page * perPage));
        if (next === current) return;

        lockedUntil = now + PAGE_LOCK_MS;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollTo({ top: options[next].offsetTop - padding, behavior: reduceMotion ? 'auto' : 'smooth' });
      };

      panel.addEventListener('wheel', onWheel, { passive: false });
      cleanup.current = () => panel.removeEventListener('wheel', onWheel);
    },
    [perPage]
  );
}
