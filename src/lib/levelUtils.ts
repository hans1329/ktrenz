/**
 * Level progression derived from total_points (lifetime XP).
 * Each level requires `level * 100` points to advance.
 * Lv1: 0→100, Lv2: 100→300, Lv3: 300→600 … cumulative = n*(n+1)/2 * 100 / 2
 * Simplified: thresholds = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, ...]
 */

export interface LevelInfo {
  level: number;
  currentXp: number;       // XP within current level
  xpForNextLevel: number;  // XP needed for next level
  totalXp: number;         // raw total_points
  progress: number;        // 0–100%
}

function cumulativeXp(level: number): number {
  // sum of 100 * i for i = 1..level = 100 * level*(level+1)/2
  return 100 * level * (level + 1) / 2;
}

export function getLevelInfo(totalPoints: number): LevelInfo {
  const tp = Math.max(0, totalPoints);
  let level = 1;
  while (cumulativeXp(level) <= tp) {
    level++;
  }
  // level is now the current level (1-based)
  const prevThreshold = cumulativeXp(level - 1);
  const nextThreshold = cumulativeXp(level);
  const currentXp = tp - prevThreshold;
  const xpForNextLevel = nextThreshold - prevThreshold; // = 100 * level
  const progress = Math.min(100, Math.round((currentXp / xpForNextLevel) * 100));

  return { level, currentXp, xpForNextLevel, totalXp: tp, progress };
}

// Tier info based on level ranges
export const LEVEL_TIERS = [
  { minLevel: 1, maxLevel: 5, tier: { en: "Beginner", ko: "초보", ja: "初心者", zh: "新手" }, tickets: 3 },
  { minLevel: 6, maxLevel: 15, tier: { en: "Explorer", ko: "탐색가", ja: "探索者", zh: "探索者" }, tickets: 5 },
  { minLevel: 16, maxLevel: 30, tier: { en: "Analyst", ko: "분석가", ja: "分析家", zh: "分析师" }, tickets: 7 },
  { minLevel: 31, maxLevel: 999, tier: { en: "Expert", ko: "전문가", ja: "専門家", zh: "专家" }, tickets: 10 },
] as const;

export function getTierForLevel(level: number) {
  return LEVEL_TIERS.find(t => level >= t.minLevel && level <= t.maxLevel) ?? LEVEL_TIERS[0];
}
