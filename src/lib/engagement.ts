/**
 * Engagement gating for Battle picks.
 *
 * Users must view the trend insight AND at least N content items before they
 * can pick a side. Pure logic only — no React/state — so it can be unit tested
 * and reused (Battle.tsx, server-side checks, etc.).
 */

export const ENGAGEMENT_CONTENT_TARGET = 2;
export const ENGAGEMENT_TOTAL_STEPS = 1 + ENGAGEMENT_CONTENT_TARGET;

export type EngagementInput = {
  trendViewed: boolean;
  viewedItems: ReadonlySet<string> | string[];
};

export type EngagementSummary = {
  trendViewed: boolean;
  contentCount: number;
  totalSteps: number;
  completedSteps: number;
  complete: boolean;
};

function sizeOf(items: ReadonlySet<string> | string[]): number {
  return Array.isArray(items) ? new Set(items).size : items.size;
}

export function summarizeEngagement(input: EngagementInput | undefined): EngagementSummary {
  const trendViewed = !!input?.trendViewed;
  const rawCount = input ? sizeOf(input.viewedItems) : 0;
  const contentCount = Math.min(rawCount, ENGAGEMENT_CONTENT_TARGET);
  const completedSteps = (trendViewed ? 1 : 0) + contentCount;
  return {
    trendViewed,
    contentCount,
    totalSteps: ENGAGEMENT_TOTAL_STEPS,
    completedSteps,
    complete: trendViewed && contentCount >= ENGAGEMENT_CONTENT_TARGET,
  };
}

export function isEngagementComplete(input: EngagementInput | undefined): boolean {
  return summarizeEngagement(input).complete;
}
