/** Everything the editor can change. Saved with each thumbnail so it can be reopened. */
export interface ThumbnailDesign {
  /** Panel text. Rendered upper case. */
  title: string;
  panelSide: 'right' | 'left';
  /** Share of the width the colour panel takes, 0.3 to 0.6. */
  panelWidth: number;
  panelColor: string;
  textColor: string;
  edge: 'torn' | 'straight' | 'slant';
  /** Changes the torn edge's shape. */
  edgeSeed: number;
  /** White paper showing under the torn edge. */
  paperStrip: boolean;
  /** Multiplies the fitted title size, 0.6 to 1.3. */
  textScale: number;
  /** Photo zoom, 1 to 2.5, and focus point, 0 to 1 on each axis. */
  photoZoom: number;
  photoX: number;
  photoY: number;
  logo: {
    mode: 'image' | 'text' | 'none';
    text: string;
    color: string;
    /** Size multiplier, 0.5 to 1.6. */
    scale: number;
  };
}

export const THUMBNAIL_WIDTH = 1600;
export const THUMBNAIL_HEIGHT = 900;

export const THUMBNAIL_FONT = 'Anton';
export const THUMBNAIL_FONT_FILE = '/fonts/Anton-Regular.ttf';

const HEX = /^#[0-9a-f]{6}$/i;

/** Readable text on a panel colour: near-black on light panels, white on dark ones. */
export function contrastText(hex: string): string {
  if (!HEX.test(hex)) return '#111111';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#111111' : '#ffffff';
}

export function defaultDesign(input: { title: string; brandName?: string; brandColor?: string }): ThumbnailDesign {
  const panelColor = input.brandColor && HEX.test(input.brandColor) && input.brandColor.toLowerCase() !== '#000000'
    ? input.brandColor
    : '#5cb85c';
  return {
    title: input.title,
    panelSide: 'right',
    panelWidth: 0.42,
    panelColor,
    textColor: contrastText(panelColor),
    edge: 'torn',
    edgeSeed: Math.floor(Math.random() * 10_000),
    paperStrip: true,
    textScale: 1,
    photoZoom: 1,
    photoX: 0.5,
    photoY: 0.5,
    logo: {
      mode: input.brandName ? 'text' : 'none',
      text: input.brandName ?? '',
      color: '#ffffff',
      scale: 1,
    },
  };
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Accepts a design from a request body, filling and bounding every field. */
export function normalizeDesign(raw: unknown, fallbackTitle = ''): ThumbnailDesign {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThumbnailDesign>;
  const base = defaultDesign({ title: fallbackTitle });
  const logo = (d.logo && typeof d.logo === 'object' ? d.logo : {}) as Partial<ThumbnailDesign['logo']>;
  const color = (value: unknown, fallback: string) => (typeof value === 'string' && HEX.test(value) ? value : fallback);
  return {
    title: typeof d.title === 'string' ? d.title.slice(0, 160) : base.title,
    panelSide: d.panelSide === 'left' ? 'left' : 'right',
    panelWidth: clamp(d.panelWidth, 0.3, 0.6, base.panelWidth),
    panelColor: color(d.panelColor, base.panelColor),
    textColor: color(d.textColor, base.textColor),
    edge: d.edge === 'straight' || d.edge === 'slant' ? d.edge : 'torn',
    edgeSeed: clamp(d.edgeSeed, 0, 1_000_000, base.edgeSeed),
    paperStrip: d.paperStrip !== false,
    textScale: clamp(d.textScale, 0.6, 1.3, 1),
    photoZoom: clamp(d.photoZoom, 1, 2.5, 1),
    photoX: clamp(d.photoX, 0, 1, 0.5),
    photoY: clamp(d.photoY, 0, 1, 0.5),
    logo: {
      mode: logo.mode === 'image' || logo.mode === 'none' ? logo.mode : 'text',
      text: typeof logo.text === 'string' ? logo.text.slice(0, 60) : '',
      color: color(logo.color, '#ffffff'),
      scale: clamp(logo.scale, 0.5, 1.6, 1),
    },
  };
}
