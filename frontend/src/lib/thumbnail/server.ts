import path from 'path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { THUMBNAIL_FONT, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, type ThumbnailDesign } from './design';
import { drawThumbnail, type ThumbnailImage } from './render';

let fontRegistered = false;

function registerFont() {
  if (fontRegistered) return;
  GlobalFonts.registerFromPath(path.join(process.cwd(), 'public', 'fonts', 'Anton-Regular.ttf'), THUMBNAIL_FONT);
  fontRegistered = true;
}

async function image(bytes: Buffer | null | undefined): Promise<ThumbnailImage | null> {
  if (!bytes?.length) return null;
  return (await loadImage(bytes).catch(() => null)) as unknown as ThumbnailImage | null;
}

/** The same drawing as the editor, for automations that have no browser. */
export async function renderThumbnailPng(
  design: ThumbnailDesign,
  sources: { photo?: Buffer | null; logo?: Buffer | null },
): Promise<Buffer> {
  registerFont();
  const canvas = createCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  drawThumbnail(ctx, design, { photo: await image(sources.photo), logo: await image(sources.logo) });
  return canvas.encode('png');
}
