/**
 * Engagement gating for Battle picks.
 *
 * Users must view at least N unique content items before they can pick a side.
 * Trend insight view is tracked but no longer required for unlock — it's an
 * optional enrichment surface. Pure logic only — no React/state — so it can be
 * unit tested and reused (Battle.tsx, server-side checks, etc.).
 */

export const ENGAGEMENT_CONTENT_TARGET = 2;
export const ENGAGEMENT_TOTAL_STEPS = ENGAGEMENT_CONTENT_TARGET;

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
  return {
    trendViewed,
    contentCount,
    totalSteps: ENGAGEMENT_TOTAL_STEPS,
    completedSteps: contentCount,
    complete: contentCount >= ENGAGEMENT_CONTENT_TARGET,
  };
}

export function isEngagementComplete(input: EngagementInput | undefined): boolean {
  return summarizeEngagement(input).complete;
}
