import { describe, it, expect } from "vitest";
import { pickActivePairIdx, type PairCandidate } from "./activePair";

const VH = 1000; // viewport height
const ANCHOR = VH * 0.4; // 400

function rect(top: number, height: number) {
  return { top, bottom: top + height, height };
}

describe("pickActivePairIdx", () => {
  it("returns null when no candidates", () => {
    expect(pickActivePairIdx([], VH)).toBeNull();
  });

  it("returns null when viewport height is non-positive", () => {
    const cands: PairCandidate[] = [{ idx: 0, rect: rect(100, 200) }];
    expect(pickActivePairIdx(cands, 0)).toBeNull();
    expect(pickActivePairIdx(cands, -10)).toBeNull();
  });

  it("picks the pair whose center is closest to the 40% anchor", () => {
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(0, 300) }, // center 150 — 250 from anchor 400
      { idx: 1, rect: rect(300, 300) }, // center 450 — 50 from anchor (winner)
      { idx: 2, rect: rect(600, 300) }, // center 750 — 350 from anchor
    ];
    expect(pickActivePairIdx(cands, VH)).toBe(1);
  });

  it("ignores pairs that are entirely off-screen above", () => {
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(-500, 100) }, // bottom -400, off-screen
      { idx: 1, rect: rect(600, 200) }, // center 700 (only on-screen)
    ];
    expect(pickActivePairIdx(cands, VH)).toBe(1);
  });

  it("ignores pairs that are entirely off-screen below", () => {
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(VH + 100, 200) }, // top 1100, off-screen
      { idx: 1, rect: rect(200, 200) }, // center 300 (only on-screen)
    ];
    expect(pickActivePairIdx(cands, VH)).toBe(1);
  });

  it("returns null when every candidate is off-screen", () => {
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(-1000, 100) },
      { idx: 1, rect: rect(VH + 200, 100) },
    ];
    expect(pickActivePairIdx(cands, VH)).toBeNull();
  });

  it("a tall pair straddling the anchor wins (its center is close to anchor)", () => {
    const cands: PairCandidate[] = [
      // Tall pair starts 100, height 600 → center 400 == anchor
      { idx: 0, rect: rect(100, 600) },
      // Shorter pair clearly below
      { idx: 1, rect: rect(750, 100) }, // center 800
    ];
    expect(pickActivePairIdx(cands, VH)).toBe(0);
  });

  it("supports a custom anchor ratio", () => {
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(0, 200) }, // center 100
      { idx: 1, rect: rect(800, 200) }, // center 900
    ];
    // 90% anchor = 900 → idx 1 should win
    expect(pickActivePairIdx(cands, VH, 0.9)).toBe(1);
    // 10% anchor = 100 → idx 0 should win
    expect(pickActivePairIdx(cands, VH, 0.1)).toBe(0);
  });

  it("first candidate wins on a tie (Infinity init + < comparison)", () => {
    // Both centers exactly at anchor distance 100
    const cands: PairCandidate[] = [
      { idx: 0, rect: rect(200, 200) }, // center 300, dist 100
      { idx: 1, rect: rect(400, 200) }, // center 500, dist 100
    ];
    expect(pickActivePairIdx(cands, VH)).toBe(0);
  });
});
