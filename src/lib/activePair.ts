/**
 * Active-pair picker for the Battle list.
 *
 * Scroll-driven viewport tracking: each pair card has a DOMRect; we pick the
 * one whose center sits closest to a fixed anchor (40% down the viewport),
 * skipping cards that are entirely off-screen.
 *
 * IntersectionObserver was tried first but tall cards can sit between
 * thresholds without firing callbacks, leaving the bar stuck on a stale pair.
 */

export type PairRectLike = Pick<DOMRect, "top" | "bottom" | "height">;

export type PairCandidate = {
  idx: number;
  rect: PairRectLike;
};

export const ANCHOR_RATIO = 0.4;

export function pickActivePairIdx(
  candidates: PairCandidate[],
  viewportHeight: number,
  anchorRatio: number = ANCHOR_RATIO,
): number | null {
  if (viewportHeight <= 0) return null;
  const anchorY = viewportHeight * anchorRatio;
  let closestIdx: number | null = null;
  let closestDist = Infinity;
  for (const { idx, rect } of candidates) {
    if (rect.bottom < 0 || rect.top > viewportHeight) continue;
    const elCenter = rect.top + rect.height / 2;
    const dist = Math.abs(elCenter - anchorY);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = idx;
    }
  }
  return closestIdx;
}
