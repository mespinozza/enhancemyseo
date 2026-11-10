'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureThumbnailFont } from '@/lib/thumbnail/client';
import { defaultDesign, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, type ThumbnailLayout } from '@/lib/thumbnail/design';
import { drawThumbnail } from '@/lib/thumbnail/render';
import { samplePhoto } from '@/lib/thumbnail/sample';

interface Props {
  title: string;
  layout: ThumbnailLayout;
  color: string;
  brand?: string;
  /** Fixes the torn edge, so the server-picked shape doesn't change between renders. */
  seed: number;
  /** Text for screen readers, since the canvas itself has none. */
  label: string;
  className?: string;
  /** Draw straight away instead of waiting to scroll into view. */
  eager?: boolean;
}

/** A thumbnail drawn by the real renderer over a stand-in photo, once it's near the screen. */
export default function ThumbnailCanvas({ title, layout, color, brand, seed, label, className = '', eager = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    ensureThumbnailFont().then(() => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx || cancelled) return;
      const design = { ...defaultDesign({ title, brandName: brand, brandColor: color, layout }), edgeSeed: seed };
      drawThumbnail(ctx, design, { photo: samplePhoto(design.panelColor) });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, title, layout, color, brand, seed]);

  return (
    <canvas
      ref={ref}
      width={THUMBNAIL_WIDTH}
      height={THUMBNAIL_HEIGHT}
      role="img"
      aria-label={label}
      className={`block aspect-video h-auto w-full bg-gradient-to-br from-stone-200 to-stone-300 ${className}`}
    />
  );
}
