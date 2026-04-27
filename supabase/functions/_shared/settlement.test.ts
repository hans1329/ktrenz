import { describe, it, expect } from "vitest";
import {
  BAND_THRESHOLDS,
  CONSOLATION_REWARD,
  TREND_REWARDS,
  classifyBand,
  classifyTrendOutcome,
  growthPct,
  settlePrediction,
  trendBetReward,
} from "./settlement";

describe("growthPct", () => {
  it("computes percent growth from old → new", () => {
    expect(growthPct(100, 150)).toBe(50);
    expect(growthPct(100, 200)).toBe(100);
    expect(growthPct(100, 50)).toBe(-50);
  });

  it("handles zero/null oldScore via floor-at-1 (no div-by-zero)", () => {
    expect(growthPct(0, 100)).toBe(9900);
    expect(growthPct(null, 100)).toBe(9900);
    expect(growthPct(undefined, 100)).toBe(9900);
  });

  it("handles null/undefined newScore as 0", () => {
    expect(growthPct(100, null)).toBe(-100);
    expect(growthPct(100, undefined)).toBe(-100);
  });

  it("flat (no change) → 0%", () => {
    expect(growthPct(500, 500)).toBe(0);
  });

  it("both zero → 0% (after floor)", () => {
    // old floored to 1, new=0 → ((0-1)/1)*100 = -100
    expect(growthPct(0, 0)).toBe(-100);
  });
});

describe("classifyBand", () => {
  it.each([
    [0, "flat"],
    [10, "flat"],
    [14.99, "flat"],
    [15, "steady"],
    [29.99, "steady"],
    [30, "rising"],
    [79.99, "rising"],
    [80, "surge"],
    [200, "surge"],
  ])("growth=%s → band=%s", (growth, expected) => {
    expect(classifyBand(growth)).toBe(expected);
  });

  it("negative growth is flat", () => {
    expect(classifyBand(-50)).toBe("flat");
  });
});

describe("settlePrediction", () => {
  it("WIN: picked grew more than opponent AND met band threshold", () => {
    const r = settlePrediction({
      pickedGrowth: 40,
      opponentGrowth: 10,
      predictedBand: "rising",
    });
    expect(r.status).toBe("won");
    expect(r.reward).toBe(BAND_THRESHOLDS.rising.reward);
    expect(r.reason).toBe("battle_win_rising");
    expect(r.pickedWonVs).toBe(true);
    expect(r.bandMatched).toBe(true);
  });

  it("LOSS: picked grew more than opponent but BELOW predicted band", () => {
    // predicted "rising" (≥30) but grew only 20%
    const r = settlePrediction({
      pickedGrowth: 20,
      opponentGrowth: 5,
      predictedBand: "rising",
    });
    expect(r.status).toBe("lost");
    expect(r.reward).toBe(CONSOLATION_REWARD);
    expect(r.reason).toBe("battle_consolation");
    expect(r.pickedWonVs).toBe(true);
    expect(r.bandMatched).toBe(false);
  });

  it("LOSS: picked met band but opponent grew MORE", () => {
    const r = settlePrediction({
      pickedGrowth: 50,
      opponentGrowth: 80,
      predictedBand: "rising",
    });
    expect(r.status).toBe("lost");
    expect(r.reward).toBe(CONSOLATION_REWARD);
    expect(r.pickedWonVs).toBe(false);
    expect(r.bandMatched).toBe(true);
  });

  it("LOSS: tie on growth (picked > opponent is strict)", () => {
    const r = settlePrediction({
      pickedGrowth: 30,
      opponentGrowth: 30,
      predictedBand: "rising",
    });
    expect(r.status).toBe("lost");
    expect(r.pickedWonVs).toBe(false);
  });

  it("WIN: surge band with matching surge growth", () => {
    const r = settlePrediction({
      pickedGrowth: 120,
      opponentGrowth: 50,
      predictedBand: "surge",
    });
    expect(r.status).toBe("won");
    expect(r.reward).toBe(1000);
    expect(r.reason).toBe("battle_win_surge");
  });

  it("WIN: steady band, low growth still meets threshold", () => {
    const r = settlePrediction({
      pickedGrowth: 16,
      opponentGrowth: 5,
      predictedBand: "steady",
    });
    expect(r.status).toBe("won");
    expect(r.reward).toBe(100);
  });

  it("Unknown predicted band → bandMatched is false → loss", () => {
    const r = settlePrediction({
      pickedGrowth: 999,
      opponentGrowth: 0,
      predictedBand: "moonshot",
    });
    expect(r.status).toBe("lost");
    expect(r.bandMatched).toBe(false);
    expect(r.reward).toBe(CONSOLATION_REWARD);
  });

  it("LOSS: both negative growth (markets crashed) → consolation", () => {
    const r = settlePrediction({
      pickedGrowth: -10,
      opponentGrowth: -5,
      predictedBand: "rising",
    });
    expect(r.status).toBe("lost");
    expect(r.pickedWonVs).toBe(false);
  });

  it("rewards table is consistent (sanity check)", () => {
    expect(BAND_THRESHOLDS.steady.min).toBeLessThan(BAND_THRESHOLDS.rising.min);
    expect(BAND_THRESHOLDS.rising.min).toBeLessThan(BAND_THRESHOLDS.surge.min);
    expect(BAND_THRESHOLDS.steady.reward).toBeLessThan(BAND_THRESHOLDS.rising.reward);
    expect(BAND_THRESHOLDS.rising.reward).toBeLessThan(BAND_THRESHOLDS.surge.reward);
    expect(CONSOLATION_REWARD).toBeLessThan(BAND_THRESHOLDS.steady.reward);
  });
});

describe("classifyTrendOutcome", () => {
  it.each([
    [100, 100, "flat"], // 0% change
    [100, 109, "flat"], // 9% < 10
    [100, 110, "mild"], // 10% boundary
    [100, 114.99, "mild"],
    [100, 115, "strong"], // 15% boundary
    [100, 149, "strong"],
    [100, 150, "explosive"], // 50% boundary
    [100, 500, "explosive"],
  ])("initial=%s current=%s → %s", (initial, current, expected) => {
    expect(classifyTrendOutcome(initial, current)).toBe(expected);
  });

  it("zero initial with positive current → 100% (explosive)", () => {
    expect(classifyTrendOutcome(0, 50)).toBe("explosive");
  });

  it("zero initial with zero current → 0% (flat)", () => {
    expect(classifyTrendOutcome(0, 0)).toBe("flat");
  });

  it("negative change is flat", () => {
    expect(classifyTrendOutcome(100, 50)).toBe("flat");
  });
});

describe("trendBetReward", () => {
  it("flat outcome → consolation regardless of bet", () => {
    expect(trendBetReward("flat", "mild")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("flat", "strong")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("flat", "explosive")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("flat", "")).toBe(CONSOLATION_REWARD);
  });

  it("correct prediction pays the band reward", () => {
    expect(trendBetReward("mild", "mild")).toBe(TREND_REWARDS.mild);
    expect(trendBetReward("strong", "strong")).toBe(TREND_REWARDS.strong);
    expect(trendBetReward("explosive", "explosive")).toBe(TREND_REWARDS.explosive);
  });

  it("wrong prediction → consolation", () => {
    expect(trendBetReward("explosive", "mild")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("mild", "strong")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("strong", "explosive")).toBe(CONSOLATION_REWARD);
  });

  it("unknown bet outcome string → consolation", () => {
    expect(trendBetReward("strong", "unknown")).toBe(CONSOLATION_REWARD);
    expect(trendBetReward("strong", "")).toBe(CONSOLATION_REWARD);
  });

  it("trend reward table is monotonic", () => {
    expect(TREND_REWARDS.mild).toBeLessThan(TREND_REWARDS.strong);
    expect(TREND_REWARDS.strong).toBeLessThan(TREND_REWARDS.explosive);
    expect(CONSOLATION_REWARD).toBeLessThan(TREND_REWARDS.mild);
  });
});
