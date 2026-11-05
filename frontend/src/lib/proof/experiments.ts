/**
 * Ad angles and A/B experiments for the /proof landing page.
 *
 * Imported by the middleware, so this file must stay free of Node, Firebase and React
 * imports: it runs on the edge runtime.
 */

export const ANGLES = ['traffic', 'automation', 'cost', 'case-study'] as const;
export type Angle = (typeof ANGLES)[number];

export const DEFAULT_ANGLE: Angle = 'traffic';

export function parseAngle(value: string | null | undefined): Angle {
  return (ANGLES as readonly string[]).includes(value ?? '') ? (value as Angle) : DEFAULT_ANGLE;
}

/**
 * Each experiment is assigned independently, so a headline test and a CTA test can run
 * at the same time. The query parameter forces an arm, which is how a specific ad
 * creative pins its variant and how we preview one.
 */
export const EXPERIMENTS = {
  headline: { param: 'hl', arms: ['a', 'b'] },
  visual: { param: 'pv', arms: ['screenshot', 'stats'] },
  cta: { param: 'cta', arms: ['a', 'b'] },
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type Variants = { [K in ExperimentKey]: (typeof EXPERIMENTS)[K]['arms'][number] };

export const VARIANT_COOKIE = 'ems_lp_v';
export const VARIANT_HEADER = 'x-lp-variants';

const KEYS = Object.keys(EXPERIMENTS) as ExperimentKey[];

function isArm<K extends ExperimentKey>(key: K, value: string | null | undefined): value is Variants[K] {
  return (EXPERIMENTS[key].arms as readonly string[]).includes(value ?? '');
}

/** Cookie format: "headline:a|visual:stats|cta:b". Unknown or stale arms are dropped. */
export function decodeVariants(raw: string | null | undefined): Partial<Variants> {
  const out: Partial<Variants> = {};
  for (const pair of (raw ?? '').split('|')) {
    const [key, value] = pair.split(':');
    if (KEYS.includes(key as ExperimentKey) && isArm(key as ExperimentKey, value)) {
      (out as Record<string, string>)[key] = value;
    }
  }
  return out;
}

export function encodeVariants(variants: Variants): string {
  return KEYS.map((key) => `${key}:${variants[key]}`).join('|');
}

/**
 * Query-string overrides win, then the visitor's existing assignment, then a fresh
 * random arm. Returns whether the cookie needs (re)writing.
 */
export function resolveVariants(
  stored: Partial<Variants>,
  query: URLSearchParams,
  random: () => number = Math.random
): { variants: Variants; changed: boolean } {
  const variants = {} as Variants;
  let changed = false;

  for (const key of KEYS) {
    const forced = query.get(EXPERIMENTS[key].param);
    const arms = EXPERIMENTS[key].arms as readonly string[];
    let value: string;
    if (isArm(key, forced)) value = forced;
    else if (stored[key]) value = stored[key] as string;
    else value = arms[Math.floor(random() * arms.length)];

    if (value !== stored[key]) changed = true;
    (variants as Record<string, string>)[key] = value;
  }

  return { variants, changed };
}

export const DEFAULT_VARIANTS: Variants = { headline: 'a', visual: 'screenshot', cta: 'a' };
