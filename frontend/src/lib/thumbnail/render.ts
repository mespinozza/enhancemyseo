import { THUMBNAIL_FONT, THUMBNAIL_HEIGHT as H, THUMBNAIL_WIDTH as W, type ThumbnailDesign } from './design';

/**
 * Draws a thumbnail: photo on one side, a brand-colour panel with a torn edge on the
 * other, the title fitted line by line, and the logo under it.
 *
 * Only standard 2D canvas calls are used, so the browser editor and the server
 * (@napi-rs/canvas, for automations) produce the same image.
 */

export type ThumbnailImage = CanvasImageSource & { width: number; height: number };

export interface ThumbnailImages {
  photo?: ThumbnailImage | null;
  logo?: ThumbnailImage | null;
}

type Point = [number, number];

function random(seed: number) {
  let a = Math.floor(seed) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The panel's inner edge, top to bottom. `offset` moves it towards the photo. */
function edgeLine(design: ThumbnailDesign, edgeX: number, offset: number, seed: number): Point[] {
  const toPhoto = design.panelSide === 'right' ? -1 : 1;
  const x = edgeX + toPhoto * offset;
  if (design.edge === 'straight') return [[x, -20], [x, H + 20]];
  if (design.edge === 'slant') {
    const lean = W * 0.035 * (design.panelSide === 'right' ? 1 : -1);
    return [[x + lean, -20], [x - lean, H + 20]];
  }
  const next = random(seed);
  const points: Point[] = [];
  const phase = next() * Math.PI * 2;
  for (let y = -20; y <= H + 20; y += 9) {
    const wave = Math.sin(y / 140 + phase) * 7;
    const tear = (next() - 0.5) * 13 + (next() < 0.12 ? (next() - 0.5) * 18 : 0);
    points.push([x + wave + tear, y]);
  }
  return points;
}

function polygon(ctx: CanvasRenderingContext2D, edge: Point[], farX: number) {
  ctx.beginPath();
  ctx.moveTo(farX, -20);
  for (const [x, y] of edge) ctx.lineTo(x, y);
  ctx.lineTo(farX, H + 20);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, image: ThumbnailImage, x: number, y: number, w: number, h: number, design: ThumbnailDesign) {
  const scale = Math.max(w / image.width, h / image.height) * design.photoZoom;
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) * design.photoX;
  const dy = y + (h - dh) * design.photoY;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** Splits words into `count` lines with lengths as even as possible. */
function balance(words: string[], count: number): string[] {
  const lengths = words.map((w) => w.length);
  const total = lengths.reduce((a, b) => a + b, 0) + words.length - 1;
  const target = total / count;
  const n = words.length;
  const cost: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(0));
  cost[0][0] = 0;
  for (let line = 1; line <= count; line++) {
    for (let end = line; end <= n; end++) {
      let len = -1;
      for (let start = end - 1; start >= line - 1; start--) {
        len += lengths[start] + 1;
        const c = cost[line - 1][start] + (len - target) ** 2;
        if (c < cost[line][end]) {
          cost[line][end] = c;
          from[line][end] = start;
        }
      }
    }
  }
  const lines: string[] = [];
  let end = n;
  for (let line = count; line > 0; line--) {
    const start = from[line][end];
    lines.unshift(words.slice(start, end).join(' '));
    end = start;
  }
  return lines;
}

interface FittedLine {
  text: string;
  size: number;
}

/** Each line sized to fill the width, like a poster, then the block scaled to fit the height. */
function fitTitle(ctx: CanvasRenderingContext2D, title: string, maxW: number, maxH: number, scale: number): FittedLine[] {
  const words = title.toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const widthAt100 = (text: string) => {
    ctx.font = `100px "${THUMBNAIL_FONT}"`;
    return ctx.measureText(text).width || 1;
  };
  const lineHeight = 1.06;
  const cap = maxH * 0.3;
  let best: { lines: FittedLine[]; score: number } | null = null;
  for (let count = 1; count <= Math.min(7, words.length); count++) {
    const lines = balance(words, count);
    let sizes = lines.map((line) => Math.min(cap, (maxW / widthAt100(line)) * 100));
    const height = sizes.reduce((a, b) => a + b, 0) * lineHeight;
    const shrink = Math.min(1, maxH / height);
    sizes = sizes.map((s) => s * shrink);
    const smallest = Math.min(...sizes);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    // Rewards big type overall while keeping the smallest line readable.
    const score = mean * 0.6 + smallest * 0.4 + (count === 1 && words.length > 3 ? -50 : 0);
    if (!best || score > best.score) best = { lines: lines.map((text, i) => ({ text, size: sizes[i] })), score };
  }
  const lines = best!.lines;
  if (scale === 1) return lines;
  const scaled = lines.map((line) => ({
    text: line.text,
    size: Math.min(line.size * scale, (maxW / widthAt100(line.text)) * 100),
  }));
  const height = scaled.reduce((a, b) => a + b.size, 0) * lineHeight;
  const shrink = Math.min(1, maxH / height);
  return scaled.map((line) => ({ ...line, size: line.size * shrink }));
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  design: ThumbnailDesign,
  logo: ThumbnailImage | null | undefined,
  centerX: number,
  bottom: number,
  maxW: number,
): number {
  const boxH = H * 0.11 * design.logo.scale;
  if (design.logo.mode === 'image' && logo) {
    const scale = Math.min((maxW * 0.6) / logo.width, boxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, centerX - w / 2, bottom - h, w, h);
    return h;
  }
  if (design.logo.mode !== 'text' || !design.logo.text.trim()) return 0;

  const words = design.logo.text.trim().toUpperCase().split(/\s+/);
  // A trailing symbol such as "+" stays with the word before it.
  const tail = words.length > 2 && words[words.length - 1].length <= 2 ? 2 : 1;
  const first = words.length > 1 ? words.slice(0, -tail).join(' ') : words[0];
  const last = words.length > 1 ? words.slice(-tail).join(' ') : '';
  const size = boxH * (last ? 0.42 : 0.6);
  const fit = (text: string, px: number) => {
    ctx.font = `${px}px "${THUMBNAIL_FONT}"`;
    const width = ctx.measureText(text).width;
    return width > maxW * 0.6 ? (px * maxW * 0.6) / width : px;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = design.logo.color;

  if (!last) {
    const px = fit(first, size);
    ctx.font = `${px}px "${THUMBNAIL_FONT}"`;
    ctx.fillText(first, centerX, bottom - px * 0.1);
    return px;
  }

  const firstPx = fit(first, size);
  const lastPx = fit(last, size);
  ctx.font = `${lastPx}px "${THUMBNAIL_FONT}"`;
  const pillW = ctx.measureText(last).width + lastPx * 0.7;
  const pillH = lastPx * 1.25;
  const pillTop = bottom - pillH;
  ctx.fillStyle = lighten(design.panelColor, 0.22);
  ctx.beginPath();
  const r = pillH * 0.18;
  const left = centerX - pillW / 2;
  ctx.moveTo(left + r, pillTop);
  ctx.arcTo(left + pillW, pillTop, left + pillW, pillTop + pillH, r);
  ctx.arcTo(left + pillW, pillTop + pillH, left, pillTop + pillH, r);
  ctx.arcTo(left, pillTop + pillH, left, pillTop, r);
  ctx.arcTo(left, pillTop, left + pillW, pillTop, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = design.logo.color;
  ctx.fillText(last, centerX, pillTop + pillH * 0.84);
  ctx.font = `${firstPx}px "${THUMBNAIL_FONT}"`;
  ctx.fillText(first, centerX, pillTop - firstPx * 0.12);
  return pillH + firstPx * 1.05;
}

export function drawThumbnail(ctx: CanvasRenderingContext2D, design: ThumbnailDesign, images: ThumbnailImages = {}) {
  const right = design.panelSide === 'right';
  const panelW = W * design.panelWidth;
  const edgeX = right ? W - panelW : panelW;
  const farX = right ? W + 20 : -20;

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Photo, running a little under the panel so the torn edge never shows a gap.
  const photoX = right ? 0 : edgeX - 60;
  const photoW = W - panelW + 60;
  if (images.photo) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoX, 0, photoW, H);
    ctx.clip();
    drawCover(ctx, images.photo, photoX, 0, photoW, H, design);
    ctx.restore();
  } else {
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, '#d1d5db');
    gradient.addColorStop(1, '#9ca3af');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  if (design.paperStrip && design.edge === 'torn') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f5f3ee';
    polygon(ctx, edgeLine(design, edgeX, 30, design.edgeSeed + 7), farX);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = design.paperStrip && design.edge === 'torn' ? 6 : 18;
  ctx.fillStyle = design.panelColor;
  polygon(ctx, edgeLine(design, edgeX, 0, design.edgeSeed), farX);
  ctx.fill();
  ctx.restore();

  // Content area inside the panel, clear of the edge.
  const inset = design.edge === 'slant' ? W * 0.045 : W * 0.025;
  const padX = panelW * 0.08;
  const contentLeft = right ? edgeX + inset + padX : padX;
  const contentRight = right ? W - padX : edgeX - inset - padX;
  const contentW = contentRight - contentLeft;
  const centerX = (contentLeft + contentRight) / 2;

  const logoBottom = H * 0.93;
  const logoH = drawLogo(ctx, design, images.logo, centerX, logoBottom, contentW);
  const textTop = H * 0.12;
  const textBottom = logoH ? logoBottom - logoH - H * 0.07 : H * 0.9;

  const lines = fitTitle(ctx, design.title, contentW, textBottom - textTop, design.textScale);
  const blockH = lines.reduce((sum, line) => sum + line.size * 1.06, 0);
  let y = textTop + (textBottom - textTop - blockH) / 2;
  ctx.fillStyle = design.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    ctx.font = `${line.size}px "${THUMBNAIL_FONT}"`;
    y += line.size * 1.06;
    // Anton's caps sit high in the em box; this lands the baseline under them.
    ctx.fillText(line.text, centerX, y - line.size * 0.16);
  }

  ctx.restore();
}
