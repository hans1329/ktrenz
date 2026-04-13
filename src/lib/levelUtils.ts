/**
 * Level/tier utilities based on the DB `levels` table.
 * Tiers: 1=Beginner(0+), 2=Explorer(500+), 3=Analyst(3000+), 4=Expert(10000+)
 * 
 * Fine-grained level: each level requires (level * 50) XP to advance.
 * Cumulative: Lv.N threshold = 50 * N*(N-1)/2
 * Lv.1=0, Lv.2=50, Lv.3=150, Lv.4=300, Lv.5=500, Lv.6=750, ...
 */

type LangKey = "en" | "ko" | "ja" | "zh";

export interface TierDef {
  id: number;
  name: Record<LangKey, string>;
  requiredPoints: number;
  tickets: number;
  levelRange: string;
}

export const LEVEL_TIERS: TierDef[] = [
  { id: 1, name: { en: "Beginner", ko: "입문", ja: "初心者", zh: "新手" }, requiredPoints: 0, tickets: 3, levelRange: "Lv.1–5" },
  { id: 2, name: { en: "Explorer", ko: "탐색가", ja: "探索者", zh: "探索者" }, requiredPoints: 500, tickets: 5, levelRange: "Lv.6–15" },
  { id: 3, name: { en: "Analyst", ko: "분석가", ja: "分析家", zh: "分析师" }, requiredPoints: 3000, tickets: 7, levelRange: "Lv.16–30" },
  { id: 4, name: { en: "Expert", ko: "전문가", ja: "専門家", zh: "专家" }, requiredPoints: 10000, tickets: 10, levelRange: "Lv.31+" },
];

/** Cumulative XP needed to reach a given level */
function cumulativeXpForLevel(level: number): number {
  // Lv.N threshold = 50 * N*(N-1)/2
  return 50 * level * (level - 1) / 2;
}

export interface LevelInfo {
  tier: number;
  tierName: Record<LangKey, string>;
  level: number;             // fine-grained level (1, 2, 3, ... )
  totalXp: number;
  currentLevelXp: number;    // XP earned within current level
  xpForNextLevel: number;    // XP needed for next level
  levelProgress: number;     // 0–100 within current level
  tickets: number;
  nextTierPoints: number | null;
  tierProgress: number;
}

export function getLevelInfo(totalPoints: number): LevelInfo {
  const tp = Math.max(0, totalPoints);

  // Fine-grained level
  let level = 1;
  while (cumulativeXpForLevel(level + 1) <= tp) {
    level++;
  }
  const currentThreshold = cumulativeXpForLevel(level);
  const nextThreshold = cumulativeXpForLevel(level + 1);
  const currentLevelXp = tp - currentThreshold;
  const xpForNextLevel = nextThreshold - currentThreshold; // = 50 * level
  const levelProgress = Math.min(100, Math.round((currentLevelXp / xpForNextLevel) * 100));

  // Tier
  let currentTier = LEVEL_TIERS[0];
  for (const t of LEVEL_TIERS) {
    if (tp >= t.requiredPoints) currentTier = t;
  }
  const currentIdx = LEVEL_TIERS.indexOf(currentTier);
  const nextTier = currentIdx < LEVEL_TIERS.length - 1 ? LEVEL_TIERS[currentIdx + 1] : null;
  const tierProgress = nextTier
    ? Math.min(100, Math.round(((tp - currentTier.requiredPoints) / (nextTier.requiredPoints - currentTier.requiredPoints)) * 100))
    : 100;

  return {
    tier: currentTier.id,
    tierName: currentTier.name,
    level,
    totalXp: tp,
    currentLevelXp,
    xpForNextLevel,
    levelProgress,
    tickets: currentTier.tickets,
    nextTierPoints: nextTier?.requiredPoints ?? null,
    tierProgress,
  };
}

export function getTierForLevel(tierId: number) {
  return LEVEL_TIERS.find(t => t.id === tierId) ?? LEVEL_TIERS[0];
}
