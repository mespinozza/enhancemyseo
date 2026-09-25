'use client';

import { useEffect, useRef, useState } from 'react';
import { REST_FRAME } from '@/lib/home/demo';

/** ~30fps. Enough for a typewriter, half the renders of matching the display. */
const FRAME_MS = 33;

export interface DemoClock {
  /** Attach to the demo container; the clock only runs while it is on screen. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  elapsed: number;
  /** False when motion is off, so the UI can skip the typewriter and show full text. */
  animated: boolean;
}

/**
 * The single clock behind the home page demo.
 *
 * One timer drives every card. Giving each card its own would be simpler to write and
 * would look wrong within a minute: independent intervals drift apart, and choreography
 * is the whole point.
 *
 * It starts at rest and only begins after mount, which keeps the server and the first
 * client render identical. It stops when the section scrolls out of view or the tab is
 * hidden, and it never starts at all for a visitor who asked for reduced motion — they
 * get the finished frame, every status filled in and every bullet ticked, rather than an
 * empty card.
 */
export function useDemoClock(): DemoClock {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [elapsed, setElapsed] = useState(REST_FRAME);
  const [animated, setAnimated] = useState(false);

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

      if (onScreen && !document.hidden && delta < 1_000) {
        clock += delta;
        // Throttled so eight cards do not re-render at the display's refresh rate.
        setElapsed((current) => (clock - current >= FRAME_MS ? clock : current));
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    // requestAnimationFrame already stops in a hidden tab; resetting `last` on the way
    // back prevents the gap being credited as elapsed story time.
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
