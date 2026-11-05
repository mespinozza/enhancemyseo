import type { Angle, Variants } from './experiments';

/**
 * Copy and evidence for the /proof landing page.
 *
 * Numbers that a case study already stores (clicks, impressions, articles, dates) come
 * from Firestore through the page. What lives here is what the case study model can't
 * hold: readings off specific Search Console screenshots. Every figure in EVIDENCE was
 * read from the screenshot it annotates — change the screenshot, change these.
 */

// ─── Evidence ─────────────────────────────────────────────────────────────────

export interface ChartMarker {
  /** Position over the screenshot, as percentages of its width and height. */
  x: number;
  y: number;
  label: string;
  detail: string;
}

export interface TopPage {
  /** Search Console shows the URL; the client asked for article slugs to stay hidden. */
  path: string;
  clicks: number;
  impressions: number;
}

export interface TimelineEntry {
  when: string;
  title: string;
  body: string;
}

export interface Evidence {
  chart: { url: string; alt: string; width: number; height: number; markers: ChartMarker[] };
  pages: { url: string; alt: string; width: number; height: number };
  /** The four Search Console tiles, as displayed in the screenshot. */
  totals: { clicks: string; impressions: string; ctr: string; position: string };
  range: string;
  platform: string;
  topPages: TopPage[];
  timeline: TimelineEntry[];
  lessons: { title: string; body: string }[];
}

const MALACHY_TOP_PAGES: TopPage[] = [
  { path: '/blogs/resource-plus/rational-…', clicks: 2949, impressions: 154302 },
  { path: '/blogs/resource-plus/…', clicks: 2567, impressions: 131349 },
  { path: '/blogs/resource-plus/angelo-po-…', clicks: 1441, impressions: 31243 },
  { path: '/blogs/resource-plus/…', clicks: 984, impressions: 71713 },
  { path: '/blogs/resource-plus/rational-…', clicks: 832, impressions: 86396 },
  { path: '/blogs/resource-plus/avanti-…', clicks: 785, impressions: 23971 },
  { path: '/blogs/resource-plus/…', clicks: 700, impressions: 50069 },
  { path: '/blogs/resource-plus/…', clicks: 680, impressions: 45143 },
  { path: '/blogs/resource-plus/…', clicks: 667, impressions: 55638 },
  { path: '/blogs/resource-plus/…', clicks: 578, impressions: 67647 },
];

/** Keyed by case study slug, so the annotations only ever sit on their own screenshots. */
export const EVIDENCE: Record<string, Evidence> = {
  '0-to-25-million-organic-impressions-for-parts-distributor': {
    chart: {
      url: '/case-studies/malachy-clicks-impressions.png',
      width: 872,
      height: 363,
      alt: 'Google Search Console performance report: 62.9K total clicks and 2.76M total impressions, daily, May 2025 to September 2026',
      markers: [
        {
          x: 35,
          y: 52,
          label: 'Oct 2025',
          detail: 'First step change: daily clicks jump from roughly 100 to 300+.',
        },
        {
          x: 52.5,
          y: 44,
          label: 'Feb 2026',
          detail: 'Best stretch so far: about 430 clicks and 26K impressions on the peak day.',
        },
        {
          x: 85,
          y: 55,
          label: 'Aug 2026',
          detail: 'A second climb back toward 300 clicks a day.',
        },
      ],
    },
    pages: {
      url: '/case-studies/malachy-top-pages.png',
      width: 1024,
      height: 376,
      alt: 'Google Search Console top pages report: the ten blog articles with the most clicks, slugs redacted',
    },
    totals: { clicks: '62.9K', impressions: '2.76M', ctr: '2.3%', position: '8.3' },
    range: 'May 2025 – Sep 2026',
    platform: 'Shopify',
    topPages: MALACHY_TOP_PAGES,
    timeline: [
      {
        when: 'May – Sep 2025',
        title: 'The starting line',
        body: 'Where the Search Console window opens, the client’s store was getting roughly 50 to 150 organic clicks a day, with almost no educational content on its blog.',
      },
      {
        when: 'From Aug 2025',
        title: 'Publishing every week',
        body: 'We generated articles from the client’s own product catalog, each linking back to the products and collections it covers, and published them straight to their Shopify blog. 250 articles over 16 months — about 15 a month.',
      },
      {
        when: 'Oct 2025',
        title: 'The first jump',
        body: 'About two months in, daily clicks stepped up from around 100 to 300+, and impressions followed.',
      },
      {
        when: 'Feb 2026',
        title: 'The peak',
        body: 'The best day reached about 430 clicks and 26K impressions. Articles built around the equipment brands the client sells parts for (Rational, Angelo Po, Avanti and others) led the way.',
      },
      {
        when: 'Mar – Jul 2026',
        title: 'A quieter stretch',
        body: 'Traffic settled back down for the spring and summer. SEO isn’t a straight line — demand in this niche moves with the seasons.',
      },
      {
        when: 'Aug – Sep 2026',
        title: 'Climbing again',
        body: 'Daily clicks climbed back toward 300. Across the whole window: 62.9K clicks, 2.76M impressions, an average position of 8.3 and 150 keywords on page one.',
      },
    ],
    lessons: [
      {
        title: 'Give it two to three months',
        body: 'Nothing visible happened for the first couple of months of publishing. The first real movement came in month three.',
      },
      {
        title: 'The long tail does the work',
        body: 'The ten best articles drove about 19% of clicks. The other 240 brought in the rest — no single post carried the store.',
      },
      {
        title: 'Expect seasons, not a straight line',
        body: 'The February peak was followed by a slower spring. Steady publishing is what brought the second climb.',
      },
    ],
  },
};

// ─── Hero ─────────────────────────────────────────────────────────────────────

export interface HeroStats {
  clicks: string;
  impressions: string;
  articles: string;
  store: string;
}

export interface HeroCopy {
  eyebrow: string;
  headline: string;
  subheadline: string;
  /** Where the recommended (primary) CTA goes for this angle. */
  primary: { label: string; target: 'how' | 'plans' | 'case-study' | 'signup' };
  /** Which screenshot leads the hero for this angle. */
  featured: 'chart' | 'pages';
}

const SUBHEADLINE =
  'See how we turned a client’s existing product information into SEO-optimized articles that generated Google impressions, clicks, and organic traffic — without anyone writing every article by hand.';

type HeroFactory = (stats: HeroStats) => Omit<HeroCopy, 'primary' | 'featured'>;

/**
 * The store is a client, not ours: "we" is EnhanceMySEO doing the work, and the
 * traffic always belongs to the client.
 */
const HEADLINES: Record<Angle, Record<Variants['headline'], HeroFactory>> = {
  traffic: {
    a: () => ({
      eyebrow: 'Client results · Real Search Console data',
      headline: 'We Used AI-Powered Blog Content to Drive Thousands of Organic Visitors to a Client’s Shopify Store.',
      subheadline: SUBHEADLINE,
    }),
    b: (s) => ({
      eyebrow: 'Client results · Real Search Console data',
      headline: `Our Articles Earned a Client’s Shopify Store ${s.impressions} Google Impressions. Here’s the Proof.`,
      subheadline: SUBHEADLINE,
    }),
  },
  automation: {
    a: (s) => ({
      eyebrow: 'Client results · Automated publishing',
      headline: `We Published ${s.articles} SEO Articles for a Client — Without Writing Them One by One.`,
      subheadline: `EnhanceMySEO turned ${s.store}’s product catalog into a steady stream of SEO articles, published to Shopify on a schedule while their team ran the store.`,
    }),
    b: (s) => ({
      eyebrow: 'Client results · Automated publishing',
      headline: 'A Client’s Shopify Blog, Running on Autopilot. Here’s What It Did for Their Traffic.',
      subheadline: `Pick the products, set a schedule, and articles generate and publish themselves. These are the Search Console numbers ${s.store} saw next.`,
    }),
  },
  cost: {
    a: (s) => ({
      eyebrow: 'Client results · Traffic they own',
      headline: 'Ads Stop When the Budget Does. These Articles Kept Bringing Our Client Visitors.',
      subheadline: `Every click below came from organic search, not ads. Articles keep working after they’re published — here’s what that looked like for ${s.store}.`,
    }),
    b: (s) => ({
      eyebrow: 'Client results · Traffic they own',
      headline: `${s.clicks} Organic Clicks Our Client Didn’t Pay Per Click For.`,
      subheadline: `We built SEO articles from ${s.store}’s existing products instead of renting traffic from ad platforms. These are their actual Search Console results.`,
    }),
  },
  'case-study': {
    a: (s) => ({
      eyebrow: `Client case study · ${s.store}`,
      headline: `How a Client’s Shopify Parts Store Reached ${s.impressions} Google Impressions With Blog Content.`,
      subheadline:
        'The full timeline — what we published for them, when traffic moved, and what we learned — with the Search Console screenshots to back it up.',
    }),
    b: (s) => ({
      eyebrow: `Client case study · ${s.store}`,
      headline: `${s.articles} Articles. ${s.clicks} Organic Clicks. One Client’s Shopify Store.`,
      subheadline: `A month-by-month look at ${s.store} publishing consistently with EnhanceMySEO, straight from their Google Search Console.`,
    }),
  },
};

const PRIMARY: Record<Angle, Pick<HeroCopy, 'primary' | 'featured'>> = {
  traffic: { primary: { label: 'See How It Works', target: 'how' }, featured: 'chart' },
  automation: { primary: { label: 'See Automated Plans', target: 'plans' }, featured: 'pages' },
  cost: { primary: { label: 'Start With 2 Free Articles', target: 'signup' }, featured: 'chart' },
  'case-study': { primary: { label: 'Read the Case Study', target: 'case-study' }, featured: 'chart' },
};

export function heroCopy(angle: Angle, variants: Variants, stats: HeroStats): HeroCopy {
  return { ...HEADLINES[angle][variants.headline](stats), ...PRIMARY[angle] };
}

/** The free-signup CTA is the one most worth testing, so its wording is an experiment. */
export const FREE_CTA: Record<Variants['cta'], string> = {
  a: 'Start With 2 Free Articles',
  b: 'Try 2 Articles Free — No Card Needed',
};

// ─── Problem ──────────────────────────────────────────────────────────────────

export const PROBLEMS = [
  {
    icon: 'swords',
    title: 'Product pages compete with giants',
    body: 'Marketplaces and big retailers own the obvious product searches. A lone product page rarely outranks them.',
  },
  {
    icon: 'wallet',
    title: 'Ads stop when spending stops',
    body: 'Paid traffic disappears the day the budget runs out, and every click costs a little more each year.',
  },
  {
    icon: 'clock',
    title: 'No time to write content',
    body: 'Running the store comes first. Researching and writing helpful articles every week rarely happens.',
  },
  {
    icon: 'boxes',
    title: 'Hundreds of products, no supporting articles',
    body: 'Most catalogs have nothing that answers the questions buyers search before they’re ready to buy.',
  },
] as const;

// ─── How it works ─────────────────────────────────────────────────────────────

export const STEPS = [
  {
    title: 'Select your product',
    body: 'Choose an existing Shopify product, collection, or page.',
  },
  {
    title: 'Generate your article',
    body: 'EnhanceMySEO creates relevant, SEO-focused content with contextual internal links.',
  },
  {
    title: 'Publish and grow',
    body: 'Review and publish directly to Shopify. Track organic performance through Google Search Console over time.',
  },
] as const;

export interface DemoProduct {
  id: string;
  name: string;
  collection: string;
  price: string;
  article: {
    title: string;
    meta: string;
    outline: string[];
    links: string[];
  };
}

/** Sample products for the demo. They illustrate the output; they aren't a real store. */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'gasket',
    name: 'Combi oven door gasket',
    collection: 'Oven parts',
    price: '$89.00',
    article: {
      title: 'How to Tell When Your Combi Oven Door Gasket Needs Replacing',
      meta: 'Steam leaks, uneven cooking and rising energy bills? Here’s how to check your oven door gasket and choose the right replacement.',
      outline: [
        'Five signs your gasket is failing',
        'How to measure for the right replacement',
        'Step-by-step: swapping the gasket in 15 minutes',
        'How often should a gasket be replaced?',
      ],
      links: ['Combi oven door gasket', 'Oven parts collection', 'Gasket sizing guide'],
    },
  },
  {
    id: 'coffee',
    name: 'Ceramic pour-over set',
    collection: 'Coffee gear',
    price: '$48.00',
    article: {
      title: 'Pour-Over vs. Drip Coffee: Which Brew Method Is Right for You?',
      meta: 'Compare taste, cost and effort between pour-over and drip coffee, plus the gear you need to brew a better cup at home.',
      outline: [
        'What makes pour-over taste different',
        'Cost and time compared',
        'The gear you actually need to start',
        'Common pour-over mistakes to avoid',
      ],
      links: ['Ceramic pour-over set', 'Coffee gear collection', 'Brewing guide'],
    },
  },
  {
    id: 'blanket',
    name: 'Organic cotton baby blanket',
    collection: 'Nursery',
    price: '$36.00',
    article: {
      title: 'What to Look for in a Safe, Breathable Baby Blanket',
      meta: 'Materials, weight and safety guidelines explained, so you can choose a blanket that keeps your baby comfortable year-round.',
      outline: [
        'Why fabric breathability matters',
        'Organic cotton vs. muslin vs. fleece',
        'Safe-sleep guidelines every parent should know',
        'How to wash and care for baby blankets',
      ],
      links: ['Organic cotton baby blanket', 'Nursery collection', 'Gift sets'],
    },
  },
];

// ─── Plans ────────────────────────────────────────────────────────────────────

export const PLAN_COPY = {
  free: {
    cta: 'Try It Free',
    audience: 'See the output on your own products before you pay anything.',
    why: null,
  },
  kickstart: {
    cta: 'Choose Kickstart',
    audience: 'For smaller Shopify stores starting their SEO journey.',
    why: 'Two articles shows you the quality. Consistency is what moves traffic: 25 a month is enough to publish several times a week, with bulk generation across your catalog.',
  },
  seo_takeover: {
    cta: 'Automate My Content',
    audience: 'For growing stores that want publishing to run itself.',
    why: 'Scheduling unlocks hands-free publishing: set it daily or weekly and articles generate and push to Shopify without you. 90 a month covers a large catalog in months, not years.',
  },
  done_for_you: {
    cta: 'Explore Done For You',
    audience: 'For businesses that want SEO handled end to end.',
    why: 'A dedicated strategist runs everything — technical fixes, keyword strategy, product optimization and the blog — and reviews results with you every month.',
  },
} as const;

// ─── FAQ ──────────────────────────────────────────────────────────────────────

export const FAQS = [
  {
    q: 'Will this work for my Shopify store?',
    a: 'If you sell products people research before they buy, there are questions your articles can answer. Connect your store and EnhanceMySEO pulls in your products, collections and pages, so every article is about what you actually sell. How much traffic it brings depends on your niche, competition and how consistently you publish.',
  },
  {
    q: 'How long does organic traffic take to grow?',
    a: 'Usually months, not days. In the case study above, the first clear jump came about two months after consistent publishing started. Google needs time to find, test and trust new pages, and some niches move faster than others.',
  },
  {
    q: 'Can I edit articles before publishing?',
    a: 'Yes. Every article opens in an editor where you can rewrite any section, regenerate a block, or change the title and meta description. Nothing goes to Shopify until you publish it — or until you turn on scheduled publishing yourself.',
  },
  {
    q: 'Does EnhanceMySEO create internal links?',
    a: 'Yes. Articles link to the relevant products, collections and pages from your store, using the real URLs pulled from Shopify, so readers can go straight from an answer to the product.',
  },
  {
    q: 'Can I upgrade or downgrade my subscription?',
    a: 'Any time, from your account settings. Upgrades apply immediately; there are no contracts and you can cancel whenever you like.',
  },
  {
    q: 'Do I need SEO experience?',
    a: 'No. Keyword ideas, article structure, internal links and meta descriptions are handled for you. Knowing your products is the part that matters, and you already do.',
  },
  {
    q: 'Will AI-generated content automatically rank?',
    a: 'No — and nobody can honestly promise that it will. Google rewards content that is helpful and accurate, whoever writes it. EnhanceMySEO researches facts, writes around your real products and gives you control before publishing, which gives your articles a strong chance, not a guarantee.',
  },
] as const;
