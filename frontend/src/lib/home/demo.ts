/**
 * The scripted product demo on the home page.
 *
 * Two rules shape this file. It is data, not markup: adding a capability to the grid is
 * an entry here rather than another hand-written card, which is how the old Features
 * section drifted into four near-identical copies of the same div. And it is pure, with
 * no React and no timers, so the frame a given moment produces can be asserted in a gate
 * test instead of watched.
 *
 * Everything the script says is something the product actually does. The sequence is the
 * automation runner's real pipeline — take a topic, rewrite it for buyer intent, match
 * store content, write, fact-check, push to Shopify — so the demo cannot drift into
 * promising features that do not exist.
 */

/** One pass of the story. Long enough to read, short enough to watch twice. */
export const LOOP_MS = 26_000;

export type DemoIcon =
  | 'article'
  | 'schedule'
  | 'traffic'
  | 'shopify'
  | 'keywords'
  | 'catalog'
  | 'brand'
  | 'editor';

export interface DemoBullet {
  id: string;
  label: string;
}

export interface DemoCard {
  id: string;
  title: string;
  icon: DemoIcon;
  bullets: DemoBullet[];
  /** Shown before the script touches this card, and again after the loop resets. */
  idleStatus: string;
  /**
   * Double-width. Four of these against four single tiles fills three even rows, so the
   * grid ends square instead of trailing off with a half-empty row.
   */
  featured?: boolean;
}

/**
 * Only shipped features. Each maps to something that runs today: /dashboard/automate,
 * /dashboard/articles, the gsc/* and shopify/* endpoints, /dashboard/keywords,
 * /dashboard/products and /collections, /dashboard/settings/brands, and the block editor.
 *
 * Nothing here is aspirational. A card for work in progress reads as a promise, and the
 * section this replaced lost its credibility exactly that way.
 */
export const DEMO_CARDS: DemoCard[] = [
  {
    id: 'schedule',
    title: 'Scheduled automations',
    icon: 'schedule',
    featured: true,
    bullets: [
      { id: 'cadence', label: 'Daily or weekly, at the hour you pick' },
      { id: 'topics', label: 'Works through your topic list in order' },
      { id: 'intent', label: 'Rewrites each topic as a buyer-intent keyword' },
      { id: 'cap', label: 'Monthly article cap you set' },
    ],
    idleStatus: 'Waiting for the next run',
  },
  {
    id: 'article',
    title: 'Article generation',
    icon: 'article',
    featured: true,
    bullets: [
      { id: 'draft', label: 'Long-form drafts built around your products' },
      { id: 'factcheck', label: 'Fact-checked before anything publishes' },
      { id: 'links', label: 'Internal links checked for dead ends' },
    ],
    idleStatus: 'Ready to write',
  },
  {
    id: 'keywords',
    title: 'Keywords',
    icon: 'keywords',
    bullets: [
      { id: 'generate', label: 'Generate keywords for a brand' },
      { id: 'suggest', label: 'Suggestions drawn from your catalog' },
      { id: 'dedupe', label: 'Skips anything already written' },
    ],
    idleStatus: 'Idle',
  },
  {
    id: 'traffic',
    title: 'Search Console',
    icon: 'traffic',
    bullets: [
      { id: 'connect', label: 'Connect your property in one click' },
      { id: 'rank', label: 'Rank by clicks or impressions' },
      { id: 'dimension', label: 'Target search terms or landing pages' },
      { id: 'preview', label: 'Preview the picks before it runs' },
    ],
    idleStatus: 'Connected',
  },
  {
    id: 'shopify',
    title: 'Shopify publishing',
    icon: 'shopify',
    bullets: [
      { id: 'oauth', label: 'Connect your store with one click' },
      { id: 'blog', label: 'Choose which blog receives posts' },
      { id: 'status', label: 'Publish live or hold as a draft' },
      { id: 'author', label: 'Posts under your own byline' },
    ],
    idleStatus: 'Store connected',
  },
  {
    id: 'catalog',
    title: 'Products & collections',
    icon: 'catalog',
    bullets: [
      { id: 'optimize', label: 'Rewrite product descriptions' },
      { id: 'collections', label: 'Optimize collection pages' },
      { id: 'search', label: 'Search your store content' },
    ],
    idleStatus: 'Catalog synced',
  },
  {
    id: 'brand',
    title: 'Brand profiles',
    icon: 'brand',
    featured: true,
    bullets: [
      { id: 'tone', label: 'Tone of voice per brand' },
      { id: 'guidelines', label: 'Guidelines the writer follows' },
      { id: 'multi', label: 'Run more than one brand' },
    ],
    idleStatus: 'Guidelines loaded',
  },
  {
    id: 'editor',
    title: 'Article editor',
    icon: 'editor',
    featured: true,
    bullets: [
      { id: 'blocks', label: 'Edit block by block' },
      { id: 'rewrite', label: 'Rewrite any section on its own' },
      { id: 'images', label: 'Upload and place your own images' },
    ],
    idleStatus: 'Draft saved',
  },
];

export interface DemoStep {
  /** Milliseconds into the loop. Must stay sorted; the gate test enforces it. */
  at: number;
  card: string;
  /** Replaces the card's status line and restarts its typewriter. */
  status?: string;
  /** Marks one bullet as done for the rest of this loop. */
  completes?: string;
  /** Lights the card's indicator. */
  active?: boolean;
}

/**
 * One run of the Daily Blogs automation, in the order the runner really performs it.
 * Cards outside the story get slower ambient lines so the grid does not look half-dead.
 */
export const DEMO_SCRIPT: DemoStep[] = [
  { at: 400, card: 'schedule', status: 'Daily Blogs is due at 8:00 AM', active: true },
  { at: 2_200, card: 'schedule', status: 'Taking topic 3 of 31 from the list', completes: 'cadence' },
  { at: 3_000, card: 'brand', status: 'Loading tone of voice for Posh Cave', active: true },
  { at: 3_600, card: 'schedule', completes: 'topics' },

  { at: 4_200, card: 'keywords', status: 'Rewriting the topic for buyer intent', active: true },
  { at: 5_000, card: 'brand', status: 'Writing in the Posh Cave voice', completes: 'tone' },
  { at: 6_200, card: 'keywords', status: '"what size sauna do i need for 2 3 or 4 people"', completes: 'generate' },
  { at: 6_800, card: 'schedule', completes: 'intent' },
  { at: 7_400, card: 'keywords', status: 'Checked against 381 already written', completes: 'dedupe' },

  { at: 7_800, card: 'catalog', status: 'Matching products from your store', active: true },
  { at: 9_600, card: 'catalog', status: 'Found 6 products and 2 collections', completes: 'search' },

  { at: 10_200, card: 'article', status: 'Writing the draft', active: true },
  { at: 11_400, card: 'brand', status: 'Following your writing guidelines', completes: 'guidelines' },
  { at: 13_000, card: 'article', status: '1,712 words written', completes: 'draft' },
  { at: 13_800, card: 'editor', status: 'Draft opened in the editor', active: true },
  { at: 14_200, card: 'article', status: 'Fact-checking against live sources' },
  { at: 16_600, card: 'article', status: 'Fact-check passed on the first pass', completes: 'factcheck' },
  { at: 17_400, card: 'article', status: 'Internal links verified', completes: 'links' },

  { at: 18_200, card: 'shopify', status: 'Pushing to your blog', active: true },
  { at: 20_200, card: 'shopify', status: 'Published under your byline', completes: 'blog' },
  { at: 20_800, card: 'shopify', completes: 'author' },

  { at: 21_600, card: 'traffic', status: 'Watching this keyword for movement', active: true },
  { at: 22_600, card: 'schedule', status: 'Next run tomorrow at 8:00 AM', completes: 'cap' },
  { at: 23_400, card: 'article', status: '4 articles still allowed this month' },
  { at: 24_200, card: 'brand', status: 'Posh Cave, 1 of your 2 brands', completes: 'multi' },
];

export interface CardState {
  status: string;
  /** How long the current status has been showing, for the typewriter. */
  statusSince: number;
  /** Bullet ids completed so far this loop. */
  done: string[];
  active: boolean;
}

/**
 * Every card's state at a moment in the loop.
 *
 * Derived from elapsed time rather than accumulated by a timer, so a paused tab, a
 * dropped frame or a remount all resolve to the same picture instead of drifting.
 */
export function cardStatesAt(elapsedMs: number): Record<string, CardState> {
  const position = ((elapsedMs % LOOP_MS) + LOOP_MS) % LOOP_MS;

  const states: Record<string, CardState> = {};
  for (const card of DEMO_CARDS) {
    states[card.id] = { status: card.idleStatus, statusSince: position, done: [], active: false };
  }

  for (const step of DEMO_SCRIPT) {
    if (step.at > position) break;

    const state = states[step.card];
    if (!state) continue;

    if (step.status !== undefined) {
      state.status = step.status;
      state.statusSince = position - step.at;
    }
    if (step.completes && !state.done.includes(step.completes)) {
      state.done.push(step.completes);
    }
    if (step.active !== undefined) {
      state.active = step.active;
    }
  }

  return states;
}

/** The last moment of the loop, after every step has run. */
export const REST_FRAME = LOOP_MS - 1;

/**
 * The still frame: what the server renders, and what a visitor who opted out of motion
 * keeps looking at.
 *
 * Deliberately not a moment in the loop. The script follows one article through one run,
 * so at every instant in it most bullets are still grey — frozen, that reads as half the
 * product being unavailable, which is the impression this section exists to correct. The
 * resting picture is the finished one instead: every capability ticked, each card holding
 * the line the script left it on.
 */
export function restStates(): Record<string, CardState> {
  const states = cardStatesAt(REST_FRAME);
  for (const card of DEMO_CARDS) {
    states[card.id] = {
      ...states[card.id],
      done: card.bullets.map((bullet) => bullet.id),
      active: true,
    };
  }
  return states;
}

/**
 * A status line part-way through being typed.
 *
 * Time-based rather than an index that ticks, for the same reason as above: a frame
 * skipped while the tab was hidden must not leave a line half-written forever.
 */
export function typeOut(text: string, sinceMs: number, msPerChar = 24): string {
  if (sinceMs <= 0) return '';
  const revealed = Math.floor(sinceMs / msPerChar);
  return revealed >= text.length ? text : text.slice(0, revealed);
}
