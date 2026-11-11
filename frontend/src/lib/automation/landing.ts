import { USAGE_LIMITS } from '@/lib/usage-limits';
import { DEFAULT_MONTHLY_ARTICLE_CAP, MAX_ARTICLES_PER_RUN } from './types';
import { automationLimit } from './limits';

/** Copy for the /services/seo-growth-automation landing page. */

export const PROBLEMS = [
  {
    title: 'Publishing stalls when you get busy',
    body: 'A blog only grows if it keeps publishing. Most stores post in bursts, then go quiet for months.',
  },
  {
    title: 'Keyword research never ends',
    body: 'Every article starts with deciding what to write about, and that decision is the first thing to slip.',
  },
  {
    title: 'Agencies cost thousands a month',
    body: 'Hiring writers or an agency to keep up a steady schedule rarely pays back for a small store.',
  },
];

export const STEPS = [
  {
    title: 'Point it at your brand',
    body: 'Pick a brand profile. Its products, collections, pages and tone are what every article is built from.',
  },
  {
    title: 'Choose what to write about',
    body: 'Give it a list of topics, send it a keyword collection, or let it pick your best Search Console queries.',
  },
  {
    title: 'Set the schedule and the limits',
    body: `Daily or on chosen weekdays, at the hour you pick, up to ${MAX_ARTICLES_PER_RUN} articles per run, with a monthly cap you control.`,
  },
  {
    title: 'Review or let it publish',
    body: 'Articles land as drafts for you to check, or go straight to your Shopify blog with a featured image.',
  },
];

export const SOURCES = [
  {
    icon: 'list',
    title: 'Your topic list',
    body: 'Work through the topics you care about in order. Each one is rewritten as a buyer-intent keyword, so a short list keeps producing fresh articles.',
  },
  {
    icon: 'search',
    title: 'Search Console opportunities',
    body: 'Connect Google Search Console and it writes around the queries and pages already earning clicks or impressions, so you build on what is working.',
  },
  {
    icon: 'collection',
    title: 'Keyword collections',
    body: 'Plan a long-tail keyword collection from your store, then send it to an automation in one click.',
  },
] as const;

export const SAFEGUARDS = [
  { title: 'Drafts by default', body: 'Nothing goes live until you switch auto-publish on. Drafts wait in Shopify for your review.' },
  {
    title: 'A monthly cap per automation',
    body: `Each automation stops at the cap you set (${DEFAULT_MONTHLY_ARTICLE_CAP} a month to start), so spending never surprises you.`,
  },
  { title: 'Fact-checked before publishing', body: 'Claims are checked with live web search and corrected, and the run notes anything it could not verify.' },
  { title: 'No repeat articles', body: 'Topics you already have articles for are skipped, and the run history says so.' },
  { title: 'A clear run history', body: 'Every run shows the keyword, the article, and why anything was skipped or failed.' },
  { title: 'Pause any time', body: 'Turn an automation off, edit it, or run it once by hand to test a change.' },
];

export const FEATURES = [
  { icon: 'shopify', title: 'Built from your products', body: 'Articles link and feature the right products and collections from your store.' },
  { icon: 'image', title: 'Featured image included', body: 'A thumbnail in your brand is made for each article and set as the featured image.' },
  { icon: 'type', title: 'Varied formats', body: 'How-tos, comparisons, top lists, reviews and more, matched to each keyword so the blog never feels repetitive.' },
  { icon: 'voice', title: 'Your tone of voice', body: 'Choose a tone and add instructions; every article follows your brand guidelines.' },
  { icon: 'links', title: 'Internal links that build authority', body: 'Each article links to your relevant products, collections and pages, so authority flows to what you sell.' },
  { icon: 'brands', title: 'One per brand, or several', body: 'Run separate automations for different brands, topics or schedules.' },
] as const;

export function planRows() {
  return [
    { key: 'kickstart', name: 'Kickstart', automations: automationLimit('kickstart'), articles: USAGE_LIMITS.kickstart.articles },
    { key: 'seo_takeover', name: 'SEO Takeover', automations: automationLimit('seo_takeover'), articles: USAGE_LIMITS.seo_takeover.articles },
  ] as const;
}

export const FAQS = [
  {
    q: 'What is SEO growth automation?',
    a: 'It is a scheduled job that picks a keyword, writes an SEO article around your products, fact-checks it, adds a featured image and publishes it to your Shopify blog, on the days and at the time you choose.',
  },
  {
    q: 'How many automations can I run?',
    a: `Kickstart runs ${automationLimit('kickstart')} automation at a time and SEO Takeover runs ${automationLimit('seo_takeover')}. The free plan does not include automations. You can set up more and switch between them; only the active ones count.`,
  },
  {
    q: 'Do automated articles count toward my monthly articles?',
    a: `Yes. Automated articles come out of the same monthly allowance as articles you write by hand: ${USAGE_LIMITS.kickstart.articles} on Kickstart and ${USAGE_LIMITS.seo_takeover.articles} on SEO Takeover. Each automation also has its own monthly cap.`,
  },
  {
    q: 'Will it publish without me checking?',
    a: 'Only if you want it to. By default articles are saved as drafts. You can push them to Shopify as drafts, or switch on live publishing once you trust the results.',
  },
  {
    q: 'Can it use my Google Search Console data?',
    a: 'Yes. Connect Search Console and an automation can write around the queries or pages already getting the most clicks or impressions, over the time window you choose.',
  },
  {
    q: 'What happens if I downgrade?',
    a: 'Your longest-running automations keep going up to your new plan\'s limit, and the rest pause with a note explaining why. Nothing is deleted.',
  },
];
