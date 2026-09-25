/**
 * The animated comparison in the hero.
 *
 * Three panels tell one argument: here is the problem, here is what we do instead, here
 * is the result. Nothing moved before, so the whole argument landed at once and read as
 * a static list. Now the points arrive in order and each one flashes as it lands — red
 * on the problems, green on the answers — and the chart draws itself underneath.
 *
 * Pure, like the rest of the home page animation: every frame is a function of elapsed
 * time, so the same code renders the server's still frame, a reduced-motion visitor's
 * view and the live loop, and the whole timeline can be asserted without a browser.
 */

/** One pass of the argument, with a beat at the end before it starts over. */
export const HERO_LOOP_MS = 12_000;

/** How long a point stays lit after it lands. */
export const FLASH_MS = 700;

const PROBLEM_START = 400;
const SOLUTION_START = 2_800;
const POINT_STEP = 700;
const CHART_START = 5_000;
const CHART_MS = 3_500;

export const PROBLEMS = [
  'Manual content optimization that takes hours',
  'Complex keyword research process',
  'No automated content generation',
];

export const SOLUTIONS = [
  'AI-powered content optimization in minutes',
  'Intelligent product and store integration',
  'Automated SEO-friendly content generation',
];

export interface PointState {
  visible: boolean;
  /** 1 the instant it lands, easing to 0. Drives the flash, so it can fade rather than blink. */
  flash: number;
}

function pointAt(position: number, appearsAt: number): PointState {
  if (position < appearsAt) return { visible: false, flash: 0 };
  const age = position - appearsAt;
  return { visible: true, flash: age >= FLASH_MS ? 0 : 1 - age / FLASH_MS };
}

/** The chart's draw, 0 to 1. */
function chartAt(position: number): number {
  if (position <= CHART_START) return 0;
  const progress = (position - CHART_START) / CHART_MS;
  return progress >= 1 ? 1 : progress;
}

export interface HeroState {
  problems: PointState[];
  solutions: PointState[];
  chart: number;
}

export function heroStateAt(elapsedMs: number): HeroState {
  const position = ((elapsedMs % HERO_LOOP_MS) + HERO_LOOP_MS) % HERO_LOOP_MS;

  return {
    problems: PROBLEMS.map((_, index) => pointAt(position, PROBLEM_START + index * POINT_STEP)),
    solutions: SOLUTIONS.map((_, index) => pointAt(position, SOLUTION_START + index * POINT_STEP)),
    chart: chartAt(position),
  };
}

/**
 * The still frame: everything said, the chart fully drawn, nothing flashing.
 *
 * A visitor who opted out of motion should read the finished argument, not catch it
 * mid-sentence with two of the three points still missing.
 */
export function heroRestState(): HeroState {
  return {
    problems: PROBLEMS.map(() => ({ visible: true, flash: 0 })),
    solutions: SOLUTIONS.map(() => ({ visible: true, flash: 0 })),
    chart: 1,
  };
}

/* ------------------------------------------------------------------ the chart ----- */

/**
 * The plot is sized by its own proportions: the svg is given a width and takes its
 * height from this ratio, so these numbers are what keep the third panel from pushing
 * the column past the bottom of the screen. Wide and shallow on purpose.
 */
export const CHART_WIDTH = 440;
export const CHART_HEIGHT = 70;

/**
 * Organic clicks generated, counted cumulatively so the line and the figure beside it
 * are telling the same story. A plausible ramp rather than a straight diagonal: the old
 * drawing was a single smooth curve to the corner, which reads as an illustration.
 */
export const CHART_SERIES = [
  // A cumulative count starts from nothing, so the series is anchored at zero. Without
  // it the readout opened on the first month's figure and every loop restarted by
  // snapping backwards to 38,200 rather than counting up from scratch.
  { label: 'Mar', value: 0 },
  { label: 'Apr', value: 38_200 },
  { label: 'May', value: 71_600 },
  { label: 'Jun', value: 121_900 },
  { label: 'Jul', value: 193_400 },
  { label: 'Aug', value: 287_500 },
  { label: 'Sep', value: 401_800 },
  { label: 'Oct', value: 528_400 },
];

export interface ChartPoint {
  x: number;
  y: number;
  label: string;
  value: number;
}

/** Series mapped into viewBox coordinates, with y inverted for SVG. */
export function chartPoints(): ChartPoint[] {
  const max = Math.max(...CHART_SERIES.map((entry) => entry.value));
  const step = CHART_SERIES.length > 1 ? CHART_WIDTH / (CHART_SERIES.length - 1) : 0;
  // A little headroom so the peak does not touch the top edge.
  const usable = CHART_HEIGHT - 8;

  return CHART_SERIES.map((entry, index) => ({
    x: index * step,
    y: CHART_HEIGHT - (entry.value / max) * usable,
    label: entry.label,
    value: entry.value,
  }));
}

export function chartLinePath(points: ChartPoint[] = chartPoints()): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

/** The same line closed along the baseline, for the fill underneath. */
export function chartAreaPath(points: ChartPoint[] = chartPoints()): string {
  const last = points[points.length - 1];
  return `${chartLinePath(points)} L${last.x},${CHART_HEIGHT} L${points[0].x},${CHART_HEIGHT} Z`;
}

/** Total length of the polyline, so the draw can be done with a dash offset. */
export function chartLength(points: ChartPoint[] = chartPoints()): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

/** Where the leading dot sits at a given point in the draw. */
export function pointAtProgress(
  progress: number,
  points: ChartPoint[] = chartPoints()
): { x: number; y: number } {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const target = chartLength(points) * clamped;

  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);

    if (travelled + segment >= target) {
      const along = segment === 0 ? 0 : (target - travelled) / segment;
      return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
    }
    travelled += segment;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/** The readout beside the chart, counting up as the line is drawn. */
export function chartValueAt(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const values = CHART_SERIES.map((entry) => entry.value);
  const exact = clamped * (values.length - 1);
  const index = Math.floor(exact);

  if (index >= values.length - 1) return values[values.length - 1];
  const within = exact - index;
  return Math.round(values[index] + (values[index + 1] - values[index]) * within);
}

