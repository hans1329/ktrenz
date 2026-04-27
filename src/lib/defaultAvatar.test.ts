import { describe, it, expect } from "vitest";
import { getDefaultAvatar } from "./defaultAvatar";

describe("getDefaultAvatar", () => {
  it("returns a non-empty string", () => {
    const a = getDefaultAvatar("user-1");
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed (same user → same avatar across calls)", () => {
    const a1 = getDefaultAvatar("user-42");
    const a2 = getDefaultAvatar("user-42");
    expect(a1).toBe(a2);
  });

  it("returns one of the bundled avatars (only 2 options exist)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(getDefaultAvatar(`seed-${i}`));
    }
    // With 50 random-ish seeds we should hit both options, but the API only
    // promises ≤2 distinct values total.
    expect(seen.size).toBeLessThanOrEqual(2);
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a stable 'anon' bucket when seed is omitted", () => {
    const a = getDefaultAvatar();
    const b = getDefaultAvatar();
    expect(a).toBe(b);
  });

  it("different seeds can produce different avatars (sanity: bucket distribution)", () => {
    // Probabilistic sanity — across many seeds we expect both buckets to appear.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(getDefaultAvatar(`u-${i}-${i * 7}`));
    }
    expect(seen.size).toBe(2);
  });
});
