import { describe, it, expect } from "vitest";
import {
  ENGAGEMENT_CONTENT_TARGET,
  ENGAGEMENT_TOTAL_STEPS,
  isEngagementComplete,
  summarizeEngagement,
} from "./engagement";

describe("ENGAGEMENT constants", () => {
  it("requires trend view + 2 content views = 3 total steps", () => {
    expect(ENGAGEMENT_CONTENT_TARGET).toBe(2);
    expect(ENGAGEMENT_TOTAL_STEPS).toBe(3);
  });
});

describe("summarizeEngagement", () => {
  it("treats undefined input as a fresh state", () => {
    const s = summarizeEngagement(undefined);
    expect(s).toEqual({
      trendViewed: false,
      contentCount: 0,
      totalSteps: 3,
      completedSteps: 0,
      complete: false,
    });
  });

  it("counts trend view alone as 1 step (incomplete)", () => {
    const s = summarizeEngagement({ trendViewed: true, viewedItems: new Set() });
    expect(s.completedSteps).toBe(1);
    expect(s.complete).toBe(false);
  });

  it("counts content views alone (no trend) as incomplete even at full count", () => {
    const s = summarizeEngagement({
      trendViewed: false,
      viewedItems: new Set(["a", "b"]),
    });
    expect(s.contentCount).toBe(2);
    expect(s.completedSteps).toBe(2);
    expect(s.complete).toBe(false);
  });

  it("caps contentCount at ENGAGEMENT_CONTENT_TARGET (2) even if more viewed", () => {
    const s = summarizeEngagement({
      trendViewed: true,
      viewedItems: new Set(["a", "b", "c", "d", "e"]),
    });
    expect(s.contentCount).toBe(2);
    expect(s.completedSteps).toBe(3);
    expect(s.complete).toBe(true);
  });

  it("trend + 2 contents = complete", () => {
    const s = summarizeEngagement({
      trendViewed: true,
      viewedItems: new Set(["a", "b"]),
    });
    expect(s.complete).toBe(true);
  });

  it("accepts an array of item ids and dedupes", () => {
    const s = summarizeEngagement({
      trendViewed: true,
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
    [false, ["a", "b"], false],
    [true, ["a"], false],
    [true, ["a", "b"], true],
    [true, ["a", "b", "c"], true],
  ])("trendViewed=%s items=%j → complete=%s", (trendViewed, items, expected) => {
    expect(
      isEngagementComplete({ trendViewed, viewedItems: items as string[] }),
    ).toBe(expected);
  });
});
