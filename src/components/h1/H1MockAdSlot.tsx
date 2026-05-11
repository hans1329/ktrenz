// Mock ad placeholder — designed so a real ad SDK can be dropped in by
// swapping the body of this component. The parent (H1AdUnlockDialog) keeps
// the countdown + completion logic; this is purely the visual surface.
//
// What a "real" replacement looks like:
//   - Google AdSense / DV360 video tag → mount their player here
//   - Meta Audience Network → render their FBAdView
//   - Self-served sponsor → swap to <video src={sponsorUrl} ... />
// The 16:9 aspect ratio + countdown chip pattern stays consistent.

import { useEffect, useState } from "react";
import { ExternalLink, Volume2 } from "lucide-react";

// Rotating mock ad creatives. Each one is a "brand" the user might believe
// is paying. Picked at random per mount so testing doesn't always show the
// same demo. Replace these stubs with real ad fetches when SDK lands.
type MockCreative = {
  brand: string;
  tagline: string;
  cta: string;
  gradient: string;     // bg gradient
  accent: string;       // CTA chip
};

const MOCK_CREATIVES: MockCreative[] = [
  {
    brand: "MELON+",
    tagline: "K-pop 무제한 스트리밍, 첫 30일 무료",
    cta: "지금 시작",
    gradient: "from-emerald-500 via-teal-500 to-cyan-600",
    accent: "bg-emerald-300 text-emerald-900",
  },
  {
    brand: "Spotify Premium",
    tagline: "Ad-free music, downloads, Hi-Fi",
    cta: "Try free",
    gradient: "from-green-600 via-green-700 to-emerald-900",
    accent: "bg-green-300 text-green-900",
  },
  {
    brand: "KTRENZ KPASS",
    tagline: "프리미엄 멤버십으로 슬롯 무제한",
    cta: "Upgrade",
    gradient: "from-violet-600 via-purple-700 to-fuchsia-800",
    accent: "bg-violet-300 text-violet-900",
  },
  {
    brand: "OLIVE YOUNG",
    tagline: "Idol-loved beauty picks · 30% off",
    cta: "Shop now",
    gradient: "from-rose-500 via-pink-600 to-orange-500",
    accent: "bg-rose-200 text-rose-900",
  },
];

function pickCreative(): MockCreative {
  return MOCK_CREATIVES[Math.floor(Math.random() * MOCK_CREATIVES.length)];
}

export type H1MockAdSlotProps = {
  /** Seconds left until the ad completes. Drives the countdown chip. */
  remaining: number;
  /** Total duration so the progress bar can compute %. */
  durationSec: number;
};

export default function H1MockAdSlot({ remaining, durationSec }: H1MockAdSlotProps) {
  // Lock a creative per mount so the visual doesn't flicker every tick.
  const [creative] = useState<MockCreative>(() => pickCreative());
  const [muted, setMuted] = useState(true);
  const pct = Math.max(0, Math.min(100, ((durationSec - remaining) / durationSec) * 100));

  // Subtle "pulse" so the surface doesn't feel completely static during the
  // 30s window — mimics video movement without bundling actual media.
  useEffect(() => {}, []);

  return (
    <div className={`relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${creative.gradient}`}>
      {/* Top bar — Sponsored chip + mute control (replaces real player chrome) */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2 z-10 bg-gradient-to-b from-black/40 to-transparent">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.18em] text-white bg-black/40 backdrop-blur">
          Sponsored
        </span>
        <button
          onClick={() => setMuted((m) => !m)}
          className="w-6 h-6 rounded-full bg-black/40 backdrop-blur text-white/80 grid place-items-center"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <Volume2 className={`w-3 h-3 ${muted ? "opacity-40" : "opacity-100"}`} />
        </button>
      </div>

      {/* Center "creative" — brand + tagline */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6 text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-2">
          {creative.brand}
        </div>
        <div className="text-base sm:text-lg font-black leading-tight mb-3 drop-shadow-lg max-w-[80%]">
          {creative.tagline}
        </div>
        <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black ${creative.accent}`}>
          {creative.cta}
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>

      {/* Countdown chip (top-right under top bar) */}
      <div className="absolute top-10 right-3 z-10 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur text-white text-[11px] font-black tabular-nums">
        {remaining}s
      </div>

      {/* Progress bar — visual cue that the ad is timed */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30 z-10">
        <div
          className="h-full bg-white/90 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
