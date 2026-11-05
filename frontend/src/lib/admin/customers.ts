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
}

export interface CustomersResponse {
  summary: CustomersSummary;
  customers: CustomerRow[];
  month: string;
  /** Users whose billing details were missing and could not be filled in from Stripe. */
  billingUnknown: number;
}
