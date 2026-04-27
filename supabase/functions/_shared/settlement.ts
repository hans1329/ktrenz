/**
 * Pure settlement logic for Battle predictions.
 *
 * Lives under supabase/functions/_shared so edge functions (Deno) can import
 * it via relative path. Vitest (Node) imports the same file from
 * src/lib/__tests__/ — keep this module Deno-and-Node-safe (no Deno globals,
 * no esm.sh URL imports here).
 */

export type Band = "steady" | "rising" | "surge";

export const BAND_THRESHOLDS: Record<Band, { min: number; reward: number }> = {
  steady: { min: 15, reward: 100 },
  rising: { min: 30, reward: 300 },
  surge: { min: 80, reward: 1000 },
};

export const CONSOLATION_REWARD = 10;

/** Percent growth from oldScore to newScore. Old is floored at 1 to avoid div-by-zero. */
export function growthPct(oldScore: number | null | undefined, newScore: number | null | undefined): number {
  const o = oldScore ?? 0;
  const n = newScore ?? 0;
  const denom = Math.max(o || 1, 1);
  return ((n - (o || 1)) / denom) * 100;
}

/** Categorize a growth % into the actual band achieved. */
export function classifyBand(growth: number): Band | "flat" {
  if (growth >= BAND_THRESHOLDS.surge.min) return "surge";
  if (growth >= BAND_THRESHOLDS.rising.min) return "rising";
  if (growth >= BAND_THRESHOLDS.steady.min) return "steady";
  return "flat";
}

export type SettlementInput = {
  pickedGrowth: number;
  opponentGrowth: number;
  predictedBand: Band | string;
};

export type SettlementResult = {
  status: "won" | "lost";
  reward: number;
  reason: string;
  pickedWonVs: boolean;
  bandMatched: boolean;
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
  const { pickedGrowth, opponentGrowth, predictedBand } = input;
  const bandConfig = BAND_THRESHOLDS[predictedBand as Band];
  const pickedWonVs = pickedGrowth > opponentGrowth;
  // Unknown band → impossible threshold so it never matches.
  const bandMatched = pickedGrowth >= (bandConfig?.min ?? Infinity);
  const won = pickedWonVs && bandMatched;
  if (won) {
    return {
      status: "won",
      reward: bandConfig.reward,
      reason: `battle_win_${predictedBand}`,
      pickedWonVs,
      bandMatched,
    };
  }
  return {
    status: "lost",
    reward: CONSOLATION_REWARD,
    reason: "battle_consolation",
    pickedWonVs,
    bandMatched,
  };
}
