/**
 * Shared automation types.
 *
 * Imported by both client components and server routes, so this file must not pull in
 * either Firebase SDK — the client and admin `Timestamp` classes are different types
 * that happen to share a shape, which `TimestampLike` captures.
 */
import type { ContentSelection } from '@/types/content-selection';

export const AUTOMATIONS_COLLECTION = 'automations';
export const AUTOMATION_RUNS_COLLECTION = 'automationRuns';

/** Generation is expensive and serial, so a single run stays small. */
export const MAX_ARTICLES_PER_RUN = 3;

/**
 * A hard ceiling per automation, independent of subscription tier. The `admin` and
 * `agency` tiers have unlimited monthly articles, so without this an enabled automation
 * on those tiers would have no spending limit at all.
 */
export const DEFAULT_MONTHLY_ARTICLE_CAP = 10;
export const MAX_MONTHLY_ARTICLE_CAP = 200;

/** A claim older than this is assumed to belong to a process that died mid-run. */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

export interface TimestampLike {
  toDate(): Date;
  toMillis(): number;
}

export type AutomationFrequency = 'daily' | 'weekly';

/**
 * `gscTraffic` is accepted and stored now but cannot run until Search Console OAuth
 * lands; the runner reports it as a skipped run explaining that it is not connected.
 */
export type AutomationTrigger = 'topicList' | 'gscTraffic';

export type AutomationRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  /** Ran, decided not to generate, and said why. Not an error. */
  | 'skipped';

export interface AutomationSchedule {
  frequency: AutomationFrequency;
  /** 0-23. Scheduling is UTC because Railway evaluates cron in UTC. */
  hourUtc: number;
  /** 0 = Sunday. Only read when frequency is 'weekly'. */
  daysOfWeek: number[];
  /** IANA zone the hour was chosen in, so the UI can show it back correctly. */
  displayTimeZone?: string;
}

export interface AutomationGscConfig {
  /** Property as Search Console reports it, e.g. 'sc-domain:example.com'. */
  siteUrl: string;
  /** Which metric decides "high traffic". */
  metric: 'clicks' | 'impressions';
  lookbackDays: number;
  /** A query below this is not worth an article. */
  minMetric: number;
}

export const DEFAULT_GSC_CONFIG: AutomationGscConfig = {
  siteUrl: '',
  metric: 'clicks',
  lookbackDays: 30,
  minMetric: 10,
};

export interface AutomationMonthUsage {
  /** 'YYYY-MM' in UTC. */
  month: string;
  count: number;
}

export interface Automation {
  id?: string;
  userId: string;
  brandId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  /** Rotated in order for the `topicList` trigger. */
  topics: string[];
  topicCursor: number;
  /** Only read when trigger is 'gscTraffic'. */
  gsc?: AutomationGscConfig;
  schedule: AutomationSchedule;
  articlesPerRun: number;
  monthlyArticleCap: number;
  monthUsage?: AutomationMonthUsage;
  contentType: string;
  toneOfVoice?: string;
  instructions?: string;
  contentSelection: ContentSelection;
  /** Off by default. Turning it on publishes without anyone reviewing the article. */
  autoPushToShopify: boolean;
  shopifyBlogId?: string;
  /** Draft by default even when auto-push is on. */
  shopifyStatus: 'draft' | 'published';
  claimedAt?: TimestampLike | null;
  lastRunAt?: TimestampLike | null;
  nextRunAt: TimestampLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface AutomationRun {
  id?: string;
  userId: string;
  automationId: string;
  /** Denormalised so history still reads correctly after a rename or delete. */
  automationName: string;
  status: AutomationRunStatus;
  trigger: AutomationTrigger;
  keyword: string;
  /** Why this keyword was chosen, e.g. 'Topic 2 of 5 in the list'. */
  triggerReason: string;
  blogId?: string | null;
  articleTitle?: string | null;
  pushedToShopify: boolean;
  error?: string | null;
  /** Set when a run succeeded but something needs a human look, e.g. fact-check flags. */
  warning?: string | null;
  startedAt: TimestampLike;
  finishedAt?: TimestampLike | null;
}

/**
 * What a form supplies. `nextRunAt` is excluded because it is always derived from the
 * schedule rather than entered, on both create and update.
 */
export type AutomationDraft = Omit<
  Automation,
  'id' | 'createdAt' | 'updatedAt' | 'claimedAt' | 'lastRunAt' | 'monthUsage' | 'nextRunAt'
>;

export const CONTENT_TYPE_OPTIONS = [
  'How-to Guide',
  'Listicle',
  'Product Comparison',
  'Buying Guide',
  'Troubleshooting Guide',
  'Industry News',
  'Case Study',
] as const;

export const TONE_OPTIONS = [
  'Professional',
  'Conversational',
  'Technical',
  'Friendly',
  'Authoritative',
] as const;

export function defaultContentSelection(): ContentSelection {
  return {
    mode: 'automatic',
    automaticOptions: {
      includeProducts: true,
      includeCollections: true,
      includePages: true,
    },
    manualSelections: {
      products: [],
      collections: [],
      pages: [],
    },
    usesSitemap: false,
  };
}
