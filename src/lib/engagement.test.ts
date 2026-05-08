import { describe, it, expect } from "vitest";
import {
  ENGAGEMENT_CONTENT_TARGET,
  ENGAGEMENT_TOTAL_STEPS,
  isEngagementComplete,
  summarizeEngagement,
} from "./engagement";

describe("ENGAGEMENT constants", () => {
  it("requires 2 content views to unlock (trend view no longer gates)", () => {
    expect(ENGAGEMENT_CONTENT_TARGET).toBe(2);
    expect(ENGAGEMENT_TOTAL_STEPS).toBe(2);
  });
});

describe("summarizeEngagement", () => {
  it("treats undefined input as a fresh state", () => {
    const s = summarizeEngagement(undefined);
    expect(s).toEqual({
      trendViewed: false,
      contentCount: 0,
      totalSteps: 2,
      completedSteps: 0,
      complete: false,
    });
  });

  it("trend view alone does not unlock", () => {
    const s = summarizeEngagement({ trendViewed: true, viewedItems: new Set() });
    expect(s.completedSteps).toBe(0);
    expect(s.complete).toBe(false);
  });

  it("2 unique content views unlocks even without trend view", () => {
    const s = summarizeEngagement({
      trendViewed: false,
      viewedItems: new Set(["a", "b"]),
    });
    expect(s.contentCount).toBe(2);
    expect(s.completedSteps).toBe(2);
    expect(s.complete).toBe(true);
  });

  it("caps contentCount at ENGAGEMENT_CONTENT_TARGET (2) even if more viewed", () => {
    const s = summarizeEngagement({
      trendViewed: true,
      viewedItems: new Set(["a", "b", "c", "d", "e"]),
    });
    expect(s.contentCount).toBe(2);
    expect(s.completedSteps).toBe(2);
    expect(s.complete).toBe(true);
  });

  it("accepts an array of item ids and dedupes", () => {
    const s = summarizeEngagement({
      trendViewed: false,
      viewedItems: ["a", "a", "b"],
    });
    expect(s.contentCount).toBe(2);
    expect(s.complete).toBe(true);
  });
});

describe("isEngagementComplete", () => {
  it.each([
    [false, [], false],
    [true, [], false],
    [false, ["a"], false],
    [true, ["a"], false],
    [false, ["a", "b"], true],
    [true, ["a", "b"], true],
    [false, ["a", "b", "c"], true],
  ])("trendViewed=%s items=%j → complete=%s", (trendViewed, items, expected) => {
    expect(
      isEngagementComplete({ trendViewed, viewedItems: items as string[] }),
    ).toBe(expected);
  });
});
