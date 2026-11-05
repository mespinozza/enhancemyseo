export type Plan = 'free' | 'kickstart' | 'seo_takeover' | 'agency' | 'admin';

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Free',
  kickstart: 'Kickstart',
  seo_takeover: 'SEO Takeover',
  agency: 'Done-for-you',
  admin: 'Admin',
};

export interface CustomerRow {
  uid: string;
  email: string | null;
  name: string | null;
  plan: Plan;
  joinedAt: string | null;
  paidSince: string | null;
  lastSignInAt: string | null;
  emailVerified: boolean;
  billingInterval: string | null;
  mrr: number;
  cancelAtPeriodEnd: boolean;
  renewsAt: string | null;
  articlesThisMonth: number;
  articlesTotal: number;
  articleLimit: number | 'unlimited';
  keywordsThisMonth: number;
  aiCostThisMonth: number;
  aiCostTotal: number;
  brands: number;
  automations: number;
  activeAutomations: number;
  shopifyConnected: boolean;
  searchConsoleConnected: boolean;
}

export interface PlanSummary {
  plan: Plan;
  customers: number;
  mrr: number;
  articlesThisMonth: number;
  aiCostThisMonth: number;
}

export interface CustomersSummary {
  totalUsers: number;
  payingCustomers: number;
  mrr: number;
  conversionRate: number;
  pendingCancellations: number;
  activeThisMonth: number;
  newThisMonth: number;
  articlesThisMonth: number;
  aiCostThisMonth: number;
  byPlan: PlanSummary[];
  signupsByMonth: { month: string; signups: number; paid: number }[];
  /** AI spend per day of the current month, up to today. */
  dailyCost: DailyCost[];
}

export interface DailyCost {
  /** Day of the month, zero-padded. */
  day: string;
  cost: number;
}

export interface CustomerArticle {
  id: string;
  title: string;
  keyword: string | null;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  aiCostUsd: number | null;
}

export interface CustomerRun {
  id: string;
  automationName: string;
  status: string;
  keyword: string;
  articleTitle: string | null;
  error: string | null;
  warning: string | null;
  startedAt: string | null;
}

export interface CustomerUsageMonth {
  month: string;
  articles: number;
  keywords: number;
  aiCostUsd: number;
  aiRequests: number;
}

export interface AdminActionEntry {
  id: string;
  action: string;
  detail: string;
  adminEmail: string | null;
  at: string | null;
}

export interface CustomerDetail {
  customer: CustomerRow;
  stripeCustomerId: string | null;
  hasStripeSubscription: boolean;
  brands: { id: string; name: string; website: string | null }[];
  connections: { kind: 'shopify' | 'gsc'; label: string; connectedAt: string | null }[];
  automations: {
    id: string;
    name: string;
    enabled: boolean;
    trigger: string;
    articlesPerRun: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
  }[];
  articles: CustomerArticle[];
  runs: CustomerRun[];
  usage: CustomerUsageMonth[];
  dailyCost: DailyCost[];
  actions: AdminActionEntry[];
}

/** Plans an admin can assign by hand. Granting admin stays a deliberate database edit. */
export const ASSIGNABLE_PLANS: Plan[] = ['free', 'kickstart', 'seo_takeover', 'agency'];

export interface CustomersResponse {
  summary: CustomersSummary;
  customers: CustomerRow[];
  month: string;
  /** Users whose billing details were missing and could not be filled in from Stripe. */
  billingUnknown: number;
}
