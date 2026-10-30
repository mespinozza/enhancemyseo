/**
 * The Enhanced article format.
 *
 * Classic articles are a single block of HTML the model writes freehand, visuals
 * included. Enhanced articles are written as structured data: the model supplies the
 * prose and the content of each block, and code renders every block from a tested
 * template. That keeps the markup valid, on-brand, sanitizer-safe and editable, however
 * the model phrases things.
 */

export type ArticleFormat = 'classic' | 'enhanced';

export type SearchIntent =
  | 'informational'
  | 'how_to'
  | 'comparison'
  | 'buyers_guide'
  | 'product_focused';

export const BLOCK_TYPES = [
  'quiz',
  'decision_guide',
  'comparison_table',
  'pros_cons',
  'steps',
  'checklist',
  'stats',
  'callout',
  'product_cards',
  'chart',
  'timeline',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface DecisionOption {
  condition: string;
  recommendation: string;
  url?: string;
}

export interface StatItem {
  value: string;
  label: string;
  /** Index into the numbered source list the writer was given. */
  sourceIndex?: number;
}

export interface ChartItem {
  label: string;
  value: number;
}

export interface StepItem {
  title: string;
  detail: string;
}

export interface TimelineEvent {
  /** A year, date or era, e.g. "1953" or "Early 2000s". */
  date: string;
  title: string;
  detail: string;
}

/**
 * One flat shape for every block, keyed by `type`. A discriminated union reads better
 * in code, but a flat object is far easier for the model to fill reliably through a
 * tool schema; the renderer reads only the fields its type uses.
 */
export interface ArticleBlockData {
  type: BlockType;
  title?: string;
  questions?: QuizQuestion[];
  options?: DecisionOption[];
  columns?: string[];
  rows?: string[][];
  verdict?: string;
  pros?: string[];
  cons?: string[];
  steps?: StepItem[];
  items?: string[];
  stats?: StatItem[];
  variant?: 'tip' | 'mistake' | 'insight';
  text?: string;
  productHandles?: string[];
  chartItems?: ChartItem[];
  unit?: string;
  events?: TimelineEvent[];
}

export interface ArticleSection {
  heading: string;
  /** Body HTML: p, ul, ol, li, h3, strong, em, a. No styles, no h1/h2. */
  html: string;
  block?: ArticleBlockData;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface EnhancedArticle {
  intent: SearchIntent;
  title: string;
  metaTitle: string;
  metaDescription: string;
  quickAnswer: string;
  keyTakeaways: string[];
  introHtml: string;
  sections: ArticleSection[];
  /**
   * The quiz is its own field rather than a section block: as a block the model could
   * leave it out, and the quiz is the one block every article is meant to have.
   */
  quiz?: ArticleBlockData | null;
  faq: FaqItem[];
  conclusionHeading: string;
  conclusionHtml: string;
  tags: string[];
  /** Indices into the numbered source list the writer was given. */
  sourcesUsed: number[];
}

/** A product the article may link to or show as a card. Live products only. */
export interface CatalogProduct {
  handle: string;
  title: string;
  url: string;
  price?: string;
  image?: { url: string; alt?: string | null } | null;
}

/** Any other page the article may link to: collections, pages, site content. */
export interface LinkTarget {
  kind: 'collection' | 'page' | 'blog' | 'website';
  title: string;
  url: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchResult {
  brief: string;
  facts: { claim: string; sourceUrl?: string }[];
  questions: string[];
  sources: ResearchSource[];
}

/** What the Shopify push and the site blog use for search listings. */
export interface ArticleSeo {
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  tags: string[];
  featuredImage?: { src: string; alt: string } | null;
}
