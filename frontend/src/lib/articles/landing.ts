/**
 * Copy for the /services/article-generation landing page. The case study figures come from
 * the proof page's EVIDENCE, and the FAQ is shared with it, so the pages never disagree.
 */

export const HERO_POINTS = ['2 free articles a month', 'No card needed', 'Publishes to Shopify'] as const;

export const COMPARISON = {
  old: {
    title: 'Writing it yourself or hiring out',
    points: [
      'Hours of research and writing per article',
      'Freelancers often charge $100 to $500 an article',
      'Generic posts that never mention your products',
      'Publishing stalls when the store gets busy',
    ],
  },
  new: {
    title: 'With EnhanceMySEO',
    points: [
      'A researched, formatted article in a few minutes',
      'Plans from $23 a month for 25 articles',
      'Built from your catalog, linking to real products',
      'Scheduled publishing that keeps going without you',
    ],
  },
} as const;

export const FEATURES = [
  {
    icon: 'store',
    title: 'Built from your catalog',
    body: 'Connect Shopify and every article is about what you actually sell: your products, collections and pages.',
  },
  {
    icon: 'link',
    title: 'Internal links that convert',
    body: 'Articles link to the right products and collections using your real store URLs, so readers can buy from the answer.',
  },
  {
    icon: 'voice',
    title: 'Your brand voice',
    body: 'A brand profile stores your tone, audience and business details, and every article is written to match.',
  },
  {
    icon: 'search',
    title: 'Researched, not made up',
    body: 'Each article is researched before it’s written, so facts and figures are current, with tables, takeaways and FAQs.',
  },
  {
    icon: 'sparkles',
    title: 'Keyword ideas on tap',
    body: 'Stuck for a topic? Generate a keyword from your brand profile, or turn a rough idea into a phrase people search for.',
  },
  {
    icon: 'calendar',
    title: 'Bulk and scheduled',
    body: 'Write up to 10 articles at once, or set a schedule and let new articles generate and publish to Shopify on their own.',
  },
] as const;
