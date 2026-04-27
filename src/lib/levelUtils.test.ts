import { describe, it, expect } from "vitest";
import { getLevelInfo, getTierForLevel, LEVEL_TIERS } from "./levelUtils";

describe("getLevelInfo", () => {
  it("clamps negative points to 0", () => {
    const info = getLevelInfo(-100);
    expect(info.totalXp).toBe(0);
    expect(info.level).toBe(1);
    expect(info.currentLevelXp).toBe(0);
    expect(info.tier).toBe(1);
  });

  it("places 0 XP at Lv.1, tier 1 (Beginner)", () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.tier).toBe(1);
    expect(info.tierName.en).toBe("Beginner");
    expect(info.currentLevelXp).toBe(0);
    expect(info.xpForNextLevel).toBe(50);
    expect(info.levelProgress).toBe(0);
  });

  it("places 50 XP exactly at Lv.2 boundary", () => {
    const info = getLevelInfo(50);
    expect(info.level).toBe(2);
    expect(info.currentLevelXp).toBe(0);
    expect(info.xpForNextLevel).toBe(100);
  });

  it("computes Lv.3 with partial progress (between 150 and 300)", () => {
    const info = getLevelInfo(200);
    expect(info.level).toBe(3);
    expect(info.currentLevelXp).toBe(50);
    expect(info.xpForNextLevel).toBe(150);
    expect(info.levelProgress).toBe(33);
  });

  it("crosses to Explorer tier at 500 XP", () => {
    const info = getLevelInfo(500);
    expect(info.tier).toBe(2);
    expect(info.tierName.en).toBe("Explorer");
    expect(info.tickets).toBe(5);
    expect(info.nextTierPoints).toBe(3000);
  });

  it("crosses to Analyst tier at 3000 XP", () => {
    const info = getLevelInfo(3000);
    expect(info.tier).toBe(3);
    expect(info.tickets).toBe(7);
    expect(info.nextTierPoints).toBe(10000);
  });

  it("Expert tier (10000+) has no next tier and tierProgress=100", () => {
    const info = getLevelInfo(15000);
    expect(info.tier).toBe(4);
    expect(info.tierName.en).toBe("Expert");
    expect(info.nextTierPoints).toBeNull();
    expect(info.tierProgress).toBe(100);
    expect(info.tickets).toBe(10);
  });

  it("tierProgress is proportional within current tier band", () => {
    // Halfway between Explorer(500) and Analyst(3000) = 1750
    const info = getLevelInfo(1750);
    expect(info.tier).toBe(2);
    expect(info.tierProgress).toBe(50);
  });

  it("levelProgress is capped at 100", () => {
    const info = getLevelInfo(49);
    expect(info.level).toBe(1);
    expect(info.levelProgress).toBeLessThanOrEqual(100);
  });
});

describe("getTierForLevel", () => {
  it("returns the tier matching the given id", () => {
    expect(getTierForLevel(2).name.en).toBe("Explorer");
    expect(getTierForLevel(4).name.en).toBe("Expert");
  });

  it("falls back to tier 1 for unknown ids", () => {
    expect(getTierForLevel(999).id).toBe(1);
    expect(getTierForLevel(0).id).toBe(1);
  });
});

describe("LEVEL_TIERS shape", () => {
  it("is sorted by requiredPoints ascending", () => {
    for (let i = 1; i < LEVEL_TIERS.length; i++) {
      expect(LEVEL_TIERS[i].requiredPoints).toBeGreaterThan(LEVEL_TIERS[i - 1].requiredPoints);
    }
  });

  it("provides 4 supported language labels per tier", () => {
    for (const t of LEVEL_TIERS) {
      expect(t.name.en).toBeTruthy();
      expect(t.name.ko).toBeTruthy();
      expect(t.name.ja).toBeTruthy();
      expect(t.name.zh).toBeTruthy();
    }
  });
});
