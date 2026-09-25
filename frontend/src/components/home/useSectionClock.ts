'use client';

import { useEffect, useRef, useState } from 'react';

/** ~30fps. Enough for a typewriter, half the renders of matching the display. */
const FRAME_MS = 33;

export interface SectionClock {
  /** Attach to the section; the clock only runs while it is on screen. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  elapsed: number;
  /** False when motion is off, so the UI can show its finished state instead. */
  animated: boolean;
}

export interface SectionClockOptions {
  /** Held still while true — a carousel should wait while it is being read. */
  paused?: boolean;
}

/**
 * The one clock behind an animated home page section.
 *
 * Sections built on this derive what to show from elapsed time rather than accumulating
 * it themselves. Independent timers per card or per slide drift apart within a minute,
 * and a tab that was hidden for ten of them comes back mid-sentence; a single clock plus
 * a pure function of elapsed time cannot.
 *
 * It starts at rest and only begins after mount, which keeps the server and the first
 * client render identical. It stops when the section scrolls out of view or the tab is
 * hidden, and it never starts at all for a visitor who asked for reduced motion.
 *
 * @param restFrame What `elapsed` reads before the clock starts, and forever if motion
 *   is off. Sections choose the still frame that represents them best.
 */
export function useSectionClock(
  restFrame: number,
  { paused = false }: SectionClockOptions = {}
): SectionClock {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(restFrame);
  const [animated, setAnimated] = useState(false);

  // Read inside the frame loop, so pausing does not tear down and restart the clock.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    setAnimated(true);
    setElapsed(0);

    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let onScreen = true;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;

      if (onScreen && !pausedRef.current && !document.hidden && delta < 1_000) {
        clock += delta;
        // Throttled so a section full of cards does not re-render at the refresh rate.
        setElapsed((current) => (clock - current >= FRAME_MS ? clock : current));
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    // requestAnimationFrame already stops in a hidden tab; resetting `last` on the way
    // back prevents the gap being credited as elapsed time.
    const onVisibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const element = containerRef.current;
    const observer = element
      ? new IntersectionObserver(
          (entries) => {
            onScreen = entries[0]?.isIntersecting ?? true;
            last = performance.now();
          },
          { threshold: 0.15 }
        )
      : null;
    if (element && observer) observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, []);

  return { containerRef, elapsed, animated };
}
