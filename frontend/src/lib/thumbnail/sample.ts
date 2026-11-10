import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from './design';

const cache = new Map<string, HTMLCanvasElement>();

function rgba(hex: string, alpha: number): string {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#9ca3af';
  const n = parseInt(value.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * A soft, out-of-focus room standing in for the photo in mock-ups, so a preview reads as a
 * thumbnail without spending an image generation. Browser only.
 */
export function samplePhoto(tint = '#9ca3af'): HTMLCanvasElement {
  const cached = cache.get(tint);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const W = canvas.width;
  const H = canvas.height;

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#efe7dc');
  base.addColorStop(0.55, '#d8c7b3');
  base.addColorStop(1, '#9f8670');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  blob(0.22, 0.18, 620, '#ffffff', 0.75);
  blob(0.3, 0.74, 420, '#7d6450', 0.6);
  blob(0.62, 0.7, 340, '#66755f', 0.5);
  blob(0.82, 0.36, 260, tint, 0.4);
  blob(0.12, 0.5, 220, '#c7b096', 0.6);
  blob(0.5, 0.32, 180, '#fff4e6', 0.7);

  // Out-of-focus highlights, placed the same way every time.
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 18; i += 1) {
    blob(next(), next() * 0.6, 18 + next() * 46, '#ffffff', 0.18 + next() * 0.25);
  }

  cache.set(tint, canvas);
  return canvas;
}
