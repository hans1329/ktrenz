// ktrenz-h1-share-image — Renders a dynamic OG image (PNG, 1200×630) for a
// shared Discover slate. SNS bots fetch this URL via the og:image meta on
// /h1/share/:slateId so the social card shows the user's actual picks rather
// than a generic site image — the "flex artifact" PRD §8 calls out as
// load-bearing for viral conversion.
//
// Pipeline: Satori (JSX → SVG) → resvg-wasm (SVG → PNG).
// Both run on Deno (Supabase edge runtime). Fonts and the wasm binary are
// fetched once per cold start and cached in module scope.

import React from "https://esm.sh/react@18.3.1";
import satori from "https://esm.sh/satori@0.10.13";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Module-scope caches ──────────────────────────────────────────────
let wasmInited = false;
let fontKR: ArrayBuffer | null = null;
let fontEN: ArrayBuffer | null = null;

async function ensureWasm() {
  if (wasmInited) return;
  const wasmUrl = "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`resvg wasm fetch ${res.status}`);
  await initWasm(await res.arrayBuffer());
  wasmInited = true;
}

async function loadFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }>> {
  // Noto Sans KR covers Latin + Korean glyphs in one font, simplifying
  // multi-language slates. Inter Bold is layered for crisper Latin
  // headlines. Fetched once per cold start.
  if (!fontKR) {
    const r = await fetch(
      "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf",
    );
    if (!r.ok) throw new Error(`NotoSansKR fetch ${r.status}`);
    fontKR = await r.arrayBuffer();
  }
  if (!fontEN) {
    const r = await fetch(
      "https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Bold.otf",
    );
    if (!r.ok) throw new Error(`Inter fetch ${r.status}`);
    fontEN = await r.arrayBuffer();
  }
  return [
    { name: "Inter", data: fontEN, weight: 700, style: "normal" },
    { name: "Noto Sans KR", data: fontKR, weight: 700, style: "normal" },
  ];
}

// ─── Slate fetch ──────────────────────────────────────────────────────
type Vouch = { item_id: string; confidence: "low" | "mid" | "high"; title: string; artist: string; thumbnail: string | null; source: string };
type Slate = { id: string; handle: string | null; drop_date: string; vouches: Vouch[] };

async function fetchSlate(slateId: string): Promise<Slate | null> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await client
    .from("ktrenz_h1_shared_slates")
    .select("id, handle, drop_date, vouches")
    .eq("id", slateId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Slate;
}

// ─── Thumbnail prefetch ───────────────────────────────────────────────
// Satori fetches img URLs itself but ours often need a referrer-less fetch.
// Prefetching to base64 also lets us strip 4xx images cleanly.
async function thumbToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { Referer: "" } });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    const b64 = btoa(String.fromCharCode(...buf));
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

// ─── Layout helpers ──────────────────────────────────────────────────
const CONFIDENCE_BG: Record<string, string> = {
  low: "#f59e0b",
  mid: "#fb923c",
  high: "#f43f5e",
};

const e = React.createElement;

function VouchTile({ v }: { v: Vouch & { thumbDataUri: string | null } }) {
  return e(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        overflow: "hidden",
        background: "#171717",
        flex: 1,
      },
    },
    e(
      "div",
      {
        style: {
          width: "100%",
          height: 132,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: 8,
          background: v.thumbDataUri
            ? "transparent"
            : "linear-gradient(135deg, #a855f7, #ec4899)",
          backgroundImage: v.thumbDataUri ? `url(${v.thumbDataUri})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "relative",
        },
      },
      e(
        "div",
        {
          style: {
            display: "flex",
            padding: "4px 10px",
            borderRadius: 999,
            background: CONFIDENCE_BG[v.confidence] ?? "#fb923c",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          },
        },
        v.confidence,
      ),
    ),
    e(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          padding: "10px 14px 14px",
        },
      },
      e(
        "div",
        {
          style: {
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
            textTransform: "uppercase",
            letterSpacing: 1.2,
            marginBottom: 4,
            fontWeight: 700,
            display: "flex",
          },
        },
        truncate(v.artist || "Unknown", 18),
      ),
      e(
        "div",
        {
          style: {
            fontSize: 16,
            color: "rgba(255,255,255,0.92)",
            fontWeight: 700,
            lineHeight: 1.25,
            display: "-webkit-box",
            // satori honors line-clamp via custom 'WebkitLineClamp'
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          },
        },
        truncate(v.title || "", 60),
      ),
    ),
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildTree(slate: Slate, vouchesWithImg: Array<Vouch & { thumbDataUri: string | null }>) {
  const headlineCount = slate.vouches.length;
  const handleLabel = slate.handle ? `@${slate.handle}` : "Anonymous caller";
  const dateLabel = new Date(slate.drop_date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const grid = vouchesWithImg.slice(0, 6);

  return e(
    "div",
    {
      style: {
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        padding: 56,
        position: "relative",
        fontFamily: "Inter, Noto Sans KR",
        color: "white",
      },
    },
    // Background blob
    e("div", {
      style: {
        position: "absolute",
        top: -200,
        left: -200,
        width: 700,
        height: 700,
        borderRadius: 999,
        background: "rgba(244, 63, 94, 0.18)",
        filter: "blur(80px)",
      },
    }),
    e("div", {
      style: {
        position: "absolute",
        bottom: -250,
        right: -200,
        width: 600,
        height: 600,
        borderRadius: 999,
        background: "rgba(251, 146, 60, 0.15)",
        filter: "blur(80px)",
      },
    }),

    // Header row
    e(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 36,
        },
      },
      e(
        "div",
        {
          style: {
            fontSize: 36,
            fontWeight: 900,
            color: "#a855f7",
            letterSpacing: -1,
            display: "flex",
            fontFamily: "Inter",
          },
        },
        "KtrenZ",
      ),
      e("div", {
        style: { width: 1, height: 24, background: "rgba(255,255,255,0.2)" },
      }),
      e(
        "div",
        {
          style: {
            fontSize: 18,
            fontWeight: 900,
            color: "white",
            letterSpacing: 4,
            display: "flex",
          },
        },
        "DISCOVER",
      ),
      e(
        "div",
        {
          style: {
            display: "flex",
            padding: "4px 10px",
            borderRadius: 6,
            background: "rgba(244, 63, 94, 0.2)",
            border: "1px solid rgba(244, 63, 94, 0.4)",
            color: "#fda4af",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 2,
          },
        },
        "BETA",
      ),
    ),

    // Headline
    e(
      "div",
      {
        style: {
          fontSize: 76,
          fontWeight: 900,
          letterSpacing: -2,
          lineHeight: 1.04,
          marginBottom: 14,
          display: "flex",
        },
      },
      `${headlineCount} K-pop calls.`,
    ),
    e(
      "div",
      {
        style: {
          fontSize: 26,
          color: "rgba(255,255,255,0.62)",
          marginBottom: 30,
          display: "flex",
        },
      },
      `${handleLabel} · ${dateLabel} · resolves in 7 days`,
    ),

    // Grid of vouches (3 cols × 2 rows max = 6)
    e(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 14,
          flex: 1,
        },
      },
      ...grid.map((v) =>
        e(
          "div",
          {
            key: v.item_id,
            style: {
              flex: "0 0 calc((100% - 28px) / 3)",
              maxWidth: "calc((100% - 28px) / 3)",
              display: "flex",
            },
          },
          e(VouchTile, { v }),
        ),
      ),
    ),

    // Footer
    e(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 24,
        },
      },
      e(
        "div",
        {
          style: {
            fontSize: 18,
            fontWeight: 700,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 0.5,
            display: "flex",
          },
        },
        "ktrenz.com — call them early",
      ),
      e(
        "div",
        {
          style: {
            display: "flex",
            padding: "10px 18px",
            borderRadius: 999,
            background: "white",
            color: "black",
            fontSize: 18,
            fontWeight: 900,
          },
        },
        "Open the slate →",
      ),
    ),
  );
}

// ─── Handler ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slateId = url.searchParams.get("slate") || url.searchParams.get("id");
    if (!slateId) {
      return new Response("missing ?slate=", { status: 400 });
    }

    const slate = await fetchSlate(slateId);
    if (!slate) {
      return new Response("slate not found", { status: 404 });
    }

    await ensureWasm();
    const fonts = await loadFonts();

    // Prefetch up to 6 thumbnails in parallel as data URIs
    const thumbs = await Promise.all(
      slate.vouches.slice(0, 6).map((v) => thumbToDataUri(v.thumbnail)),
    );
    const enriched = slate.vouches.slice(0, 6).map((v, i) => ({ ...v, thumbDataUri: thumbs[i] }));

    const tree = buildTree(slate, enriched);
    const svg = await satori(tree as any, {
      width: 1200,
      height: 630,
      fonts: fonts as any,
    });

    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: 1200 },
    }).render().asPng();

    return new Response(png, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        // Slate snapshots are immutable, so cache aggressively. SNS bots
        // re-scrape on share, CDN caches for fast subsequent loads.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[h1-share-image] failed:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
