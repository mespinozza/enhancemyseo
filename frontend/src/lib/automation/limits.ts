/**
 * How many automations each plan may have switched on at once. Shared by the dashboard,
 * the marketing pages and the server, so the number a customer is sold is the number the
 * runner enforces. Must not import either Firebase SDK.
 */
export const AUTOMATION_LIMITS: Record<string, number> = {
  free: 0,
  kickstart: 1,
  seo_takeover: 5,
  agency: Infinity,
  admin: Infinity,
};

export const automationLimit = (tier: string | null | undefined): number => AUTOMATION_LIMITS[tier || 'free'] ?? 0;

export const canAutomate = (tier: string | null | undefined): boolean => automationLimit(tier) > 0;

/** The tiers that can use automations at all, for navigation and other tier lists. */
export const AUTOMATION_TIERS = Object.keys(AUTOMATION_LIMITS).filter((tier) => AUTOMATION_LIMITS[tier] > 0);

/** "1 automation", "5 automations" or "Unlimited automations", for plan lists. */
export function describeAutomationLimit(tier: string): string {
  const limit = automationLimit(tier);
  if (limit === Infinity) return 'Unlimited automations';
  return `${limit} automation${limit === 1 ? '' : 's'}`;
}

/**
 * Which of a user's switched-on automations their plan covers: the oldest first, so a
 * downgrade keeps the longest-running ones going and pauses the newest.
 */
export function automationsWithinLimit<T extends { id?: string; createdAt?: { toMillis(): number } | null }>(
  enabled: T[],
  tier: string | null | undefined,
): Set<string> {
  const limit = automationLimit(tier);
  const oldestFirst = [...enabled].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
  return new Set(oldestFirst.slice(0, limit).map((automation) => automation.id as string));
}

export const PLAN_LIMIT_PAUSE_MESSAGE = (tier: string) => {
  const limit = automationLimit(tier);
  return limit > 0
    ? `Paused: your plan runs ${limit} automation${limit === 1 ? '' : 's'} at a time. Upgrade or pause another one to switch this back on.`
    : 'Paused: automations are included with Kickstart and SEO Takeover. Upgrade to switch this back on.';
};
