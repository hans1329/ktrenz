/**
 * Pure settlement logic for Battle predictions.
 *
 * Lives under supabase/functions/_shared so edge functions (Deno) can import
 * it via relative path. Vitest (Node) imports the same file from
 * src/lib/__tests__/ — keep this module Deno-and-Node-safe (no Deno globals,
 * no esm.sh URL imports here).
 */

export type Band = "steady" | "rising" | "surge" | "mythic";

// Threshold calibration history:
//   - Sprint 2B (2026-05-01): surge 80→50, added mythic 100. But analysis of
//     107 settled predictions showed actual daily volatility had stddev 5-7%,
//     avg |growth| 2.4%, max ~19%. Only 3 of 107 (2.8%) ever hit steady (15%);
//     ZERO hit rising+. Reward power-law existed only on paper.
//   - Session B (2026-05-03): recalibrated to actual volatility distribution.
//     steady 15→5 (≈1σ), rising 30→10 (≈2σ), surge 50→20 (≈3σ), mythic 100→40
//     (extreme outlier). Rewards unchanged — same payout per band, just
//     reachable now. Expected hit-rate: steady ~16%, rising ~5%, surge ~1-2%,
//     mythic ~0.5%.
export const BAND_THRESHOLDS: Record<Band, { min: number; reward: number }> = {
  steady: { min: 5, reward: 100 },
  rising: { min: 10, reward: 300 },
  surge: { min: 20, reward: 500 },
  mythic: { min: 40, reward: 2000 },
};

export const CONSOLATION_REWARD = 10;

// Streak / accuracy multiplier — separates top forecasters from casuals.
// Sample-size threshold prevents 2/2 = 100% lucky streaks from triggering 2x.
export const STREAK_MIN_SAMPLE = 5;
export const STREAK_MULTIPLIER_HIGH = 2.0;  // hit_rate ≥ 0.80
export const STREAK_MULTIPLIER_MID = 1.5;   // hit_rate ≥ 0.60

export function streakMultiplier(hitRate7d: number | null | undefined, sampleSize: number | null | undefined): number {
  const n = sampleSize ?? 0;
  const r = hitRate7d ?? 0;
  if (n < STREAK_MIN_SAMPLE) return 1.0;
  if (r >= 0.80) return STREAK_MULTIPLIER_HIGH;
  if (r >= 0.60) return STREAK_MULTIPLIER_MID;
  return 1.0;
}

/** Percent growth from oldScore to newScore. Old is floored at 1 to avoid div-by-zero. */
export function growthPct(oldScore: number | null | undefined, newScore: number | null | undefined): number {
  const o = oldScore ?? 0;
  const n = newScore ?? 0;
  const denom = Math.max(o || 1, 1);
  return ((n - (o || 1)) / denom) * 100;
}

/** Categorize a growth % into the actual band achieved. */
export function classifyBand(growth: number): Band | "flat" {
  if (growth >= BAND_THRESHOLDS.mythic.min) return "mythic";
  if (growth >= BAND_THRESHOLDS.surge.min) return "surge";
  if (growth >= BAND_THRESHOLDS.rising.min) return "rising";
  if (growth >= BAND_THRESHOLDS.steady.min) return "steady";
  return "flat";
}

export type SettlementInput = {
  pickedGrowth: number;
  opponentGrowth: number;
  predictedBand: Band | string;
  /** Multiplier applied to the WIN reward (not consolation). 1.0 = no streak. */
  streakMultiplier?: number;
};

export type SettlementResult = {
  status: "won" | "lost";
  reward: number;
  reason: string;
  pickedWonVs: boolean;
  bandMatched: boolean;
  /** Multiplier actually applied (1.0 if loss or none). */
  appliedMultiplier: number;
};

/**
 * Decide the outcome of a single prediction.
 *
 * Win conditions (BOTH must hold):
 *  1. Picked artist grew more than opponent.
 *  2. Picked growth ≥ minimum threshold for the predicted band.
 *
 * Reward: band-specific reward on win, CONSOLATION_REWARD on loss.
 */
/* ─────────── Trend market settlement (ktrenz_trend_markets) ───────────
 * Different from battle predictions: each market has a single outcome based on
 * % change of the trend's influence_index from initial to current. Bettors who
 * match the outcome get the band reward; wrong picks (and everyone in "flat")
 * get the consolation amount.
 */

export type TrendOutcome = "flat" | "mild" | "strong" | "explosive";

export const TREND_REWARDS: Record<Exclude<TrendOutcome, "flat">, number> = {
  mild: 100,
  strong: 300,
  explosive: 1000,
};

/** Classify a trend market outcome from initial→current influence score.
 *  "flat" (<10%) is the loss zone — everyone gets consolation. */
export function classifyTrendOutcome(initialScore: number, currentScore: number): TrendOutcome {
  const changePct =
    initialScore > 0
      ? ((currentScore - initialScore) / initialScore) * 100
      : currentScore > 0
        ? 100
        : 0;
  if (changePct < 10) return "flat";
  if (changePct < 15) return "mild";
  if (changePct < 50) return "strong";
  return "explosive";
}

/** Reward for a single bet given the market outcome and the bet's prediction. */
export function trendBetReward(outcome: TrendOutcome, betOutcome: string): number {
  if (outcome === "flat") return CONSOLATION_REWARD;
  if (betOutcome === outcome) return TREND_REWARDS[outcome];
  return CONSOLATION_REWARD;
}

export function settlePrediction(input: SettlementInput): SettlementResult {
  const { pickedGrowth, opponentGrowth, predictedBand, streakMultiplier: rawMultiplier } = input;
  const multiplier = rawMultiplier && rawMultiplier > 0 ? rawMultiplier : 1.0;
  const bandConfig = BAND_THRESHOLDS[predictedBand as Band];
  const pickedWonVs = pickedGrowth > opponentGrowth;
  // Unknown band → impossible threshold so it never matches.
  const bandMatched = pickedGrowth >= (bandConfig?.min ?? Infinity);
  const won = pickedWonVs && bandMatched;
  if (won) {
    return {
      status: "won",
      reward: Math.round(bandConfig.reward * multiplier),
      reason: `battle_win_${predictedBand}`,
      pickedWonVs,
      bandMatched,
      appliedMultiplier: multiplier,
    };
  }
  return {
    status: "lost",
    reward: CONSOLATION_REWARD,
    reason: "battle_consolation",
    pickedWonVs,
    bandMatched,
    appliedMultiplier: 1.0,
  };
}
