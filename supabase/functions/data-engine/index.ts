// data-engine: 데이터 수집 오케스트레이터
// 모듈: youtube, music, hanteo, buzz, energy + buzz 개별 소스(buzz_x, buzz_reddit, buzz_naver, buzz_tiktok, buzz_news, buzz_youtube)
// 모드: 개별 모듈 또는 "all" (체이닝 + 타임시프트)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPELINE = ["youtube", "music", "hanteo", "buzz", "energy"] as const;
type PipelineModule = typeof PIPELINE[number];

// buzz 개별 소스 모듈
const BUZZ_SOURCES = ["buzz_x", "buzz_reddit", "buzz_naver", "buzz_tiktok", "buzz_news", "buzz_youtube"] as const;
type BuzzSourceModule = typeof BUZZ_SOURCES[number];

type Module = PipelineModule | BuzzSourceModule;

// 모듈 완료 후 다음 모듈 시작까지 대기 시간 (초)
const DELAY_AFTER: Partial<Record<Module, number>> = {
  youtube: 10,
  music: 10,
  hanteo: 10,
  buzz: 30,
  energy: 0,
};

// ── 유틸: fire-and-forget ──

function fireAndForget(promise: Promise<any>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
}

function launchCollector(supabaseUrl: string, serviceKey: string, source: string) {
  const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ source }),
  }).catch((e) => console.warn(`[data-engine] ${source} fire error:`, e.message));
  fireAndForget(p);
}

// ── 모듈 실행기: 기본 파이프라인 ──

async function runYouTube(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Launching YouTube (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "youtube");
  return { status: "launched", module: "youtube" };
}

async function runMusic(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Launching Music (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "music");
  return { status: "launched", module: "music" };
}

async function runHanteo(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Launching Hanteo (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "hanteo");
  return { status: "launched", module: "hanteo" };
}

async function runBuzz(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running Buzz module (fire-and-forget batches)...");
  const BATCH_SIZE = 5;
  const TOTAL_BATCHES = 12;
  let launched = 0;
  for (let i = 0; i < TOTAL_BATCHES; i++) {
    const p = fetch(`${supabaseUrl}/functions/v1/buzz-cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE }),
    }).catch((e) => console.warn(`[data-engine] Buzz batch ${i} fire error:`, e.message));
    fireAndForget(p);
    launched++;
    if (i < TOTAL_BATCHES - 1) await new Promise(r => setTimeout(r, 2000));
  }
  console.log(`[data-engine] Buzz: launched ${launched} batches`);
  return { launched, batchSize: BATCH_SIZE, totalBatches: TOTAL_BATCHES };
}

async function runEnergy(supabaseUrl: string, serviceKey: string, isBaseline: boolean = false): Promise<any> {
  console.log(`[data-engine] Running Energy module... (isBaseline=${isBaseline})`);
  const resp = await fetch(`${supabaseUrl}/functions/v1/calculate-energy-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ isBaseline }),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

// ── 모듈 실행기: Buzz 개별 소스 ──
// buzz_x → crawl-x-mentions에 sources=["x_twitter"]만 전달
const BUZZ_SOURCE_MAP: Record<BuzzSourceModule, string> = {
  buzz_x: "x_twitter",
  buzz_reddit: "reddit",
  buzz_naver: "naver",
  buzz_tiktok: "tiktok",
  buzz_news: "news",
  buzz_youtube: "youtube",
};

async function runBuzzSource(supabaseUrl: string, serviceKey: string, buzzModule: BuzzSourceModule): Promise<any> {
  const sourceName = BUZZ_SOURCE_MAP[buzzModule];
  console.log(`[data-engine] Launching Buzz source: ${sourceName} (fire-and-forget batches)...`);

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: tier1Entries } = await sb.from("v3_artist_tiers").select("wiki_entry_id").eq("tier", 1);
  const tier1Ids = (tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean);

  if (tier1Ids.length === 0) return { status: "no_artists" };

  const { data: artists } = await sb.from("wiki_entries").select("id, title, metadata").eq("schema_type", "artist").in("id", tier1Ids);
  if (!artists?.length) return { status: "no_artists" };

  let launched = 0;
  for (const artist of artists) {
    const meta = artist.metadata as any;
    const hashtags = meta?.hashtags || [];
    const p = fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        artistName: artist.title,
        wikiEntryId: artist.id,
        hashtags,
        sources: [sourceName], // 개별 소스만
      }),
    }).catch((e) => console.warn(`[data-engine] Buzz ${sourceName} for ${artist.title} error:`, e.message));
    fireAndForget(p);
    launched++;
    // Firecrawl rate limit 방지
    if (launched % 3 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[data-engine] Buzz ${sourceName}: launched ${launched} artists`);
  return { status: "launched", source: sourceName, artists: launched };
}

// ── 통합 모듈 러너 맵 ──
// energy는 isBaseline 파라미터가 필요하므로 별도 처리
const MODULE_RUNNERS: Record<string, (url: string, key: string) => Promise<any>> = {
  youtube: runYouTube,
  music: runMusic,
  hanteo: runHanteo,
  buzz: runBuzz,
  energy: (url, key) => runEnergy(url, key, false), // 개별 호출 시 기본값
  // buzz 개별 소스
  ...Object.fromEntries(
    BUZZ_SOURCES.map(mod => [mod, (url: string, key: string) => runBuzzSource(url, key, mod)])
  ),
};

// ── 메인 핸들러 ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { module = "all", runId, chain, wikiEntryId, isBaseline } = body as {
      module?: string;
      runId?: string;
      chain?: string[];
      wikiEntryId?: string;
      isBaseline?: boolean;
    };

    const currentRunId = runId || crypto.randomUUID();

    // ── 개별 아티스트 + 개별 소스 모드 ──
    if (wikiEntryId && module !== "all") {
      console.log(`[data-engine] Single artist mode: ${wikiEntryId}, module: ${module}`);
      
      // 개별 아티스트 수집 → 해당 collector 직접 호출 (fire-and-forget)
      if (module === "youtube" || module === "music" || module === "hanteo") {
        const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ source: module, wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] ${module} single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // buzz 개별 소스 (buzz_x 등) 또는 buzz 전체
      if (module === "buzz" || module.startsWith("buzz_")) {
        const { data: artist } = await sb.from("wiki_entries").select("title, metadata").eq("id", wikiEntryId).single();
        if (!artist) {
          return new Response(JSON.stringify({ success: false, error: "Artist not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const meta = artist.metadata as any;
        const sources = module === "buzz"
          ? undefined // 전체 소스
          : [BUZZ_SOURCE_MAP[module as BuzzSourceModule]];

        const p = fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            artistName: artist.title,
            wikiEntryId,
            hashtags: meta?.hashtags || [],
            sources,
          }),
        }).catch((e) => console.warn(`[data-engine] Buzz single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // energy
      if (module === "energy") {
        const p = fetch(`${supabaseUrl}/functions/v1/calculate-energy-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] Energy single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── "all" 모드: 파이프라인 시작 → 첫 모듈로 체이닝 ──
    if (module === "all") {
      await sb.from("ktrenz_engine_runs").insert({
        id: currentRunId,
        status: "running",
        trigger_source: body.triggerSource || "manual",
        modules_requested: [...PIPELINE],
        current_module: PIPELINE[0],
      });

      console.log(`[data-engine] Pipeline started (run: ${currentRunId}): ${PIPELINE.join(" → ")}`);

      const remaining = [...PIPELINE].slice(1);
      fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: PIPELINE[0], runId: currentRunId, chain: remaining }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({ success: true, runId: currentRunId, message: `Pipeline started: ${PIPELINE.join(" → ")}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Tier1 전체 개별 모듈 실행 ──
    const mod = module;
    if (!MODULE_RUNNERS[mod]) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown module: ${module}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (runId) {
      await sb.from("ktrenz_engine_runs").update({ current_module: mod }).eq("id", currentRunId);
    }

    console.log(`[data-engine] Executing module: ${mod} (run: ${currentRunId})`);

    let result: any = {};
    try {
      // pipeline(runId 존재) 또는 명시적 isBaseline에서 energy 호출 시 baseline=true
      const shouldBaseline = mod === "energy" && (!!runId || isBaseline === true);
      if (mod === "energy" && shouldBaseline) {
        result = await runEnergy(supabaseUrl, serviceKey, true);
      } else {
        result = await MODULE_RUNNERS[mod](supabaseUrl, serviceKey);
      }
      console.log(`[data-engine] Module ${mod} completed:`, JSON.stringify(result).slice(0, 300));
    } catch (e) {
      console.error(`[data-engine] Module ${mod} failed:`, e);
      result = { error: (e as Error).message };
    }

    if (runId) {
      const { data: currentRun } = await sb.from("ktrenz_engine_runs").select("results").eq("id", currentRunId).maybeSingle();
      const updatedResults = { ...(currentRun?.results as any || {}), [mod]: result };
      await sb.from("ktrenz_engine_runs").update({ results: updatedResults }).eq("id", currentRunId);
    }

    // ── 체이닝 ──
    if (chain && chain.length > 0) {
      const nextModule = chain[0];
      const remainingChain = chain.slice(1);
      const delaySec = DELAY_AFTER[mod as PipelineModule] || 10;

      console.log(`[data-engine] Chaining → ${nextModule} after ${delaySec}s`);
      await new Promise(r => setTimeout(r, delaySec * 1000));

      fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: nextModule, runId: currentRunId, chain: remainingChain }),
      }).catch(() => {});
    } else if (runId && !chain?.length) {
      await sb.from("ktrenz_engine_runs")
        .update({ status: "completed", completed_at: new Date().toISOString(), current_module: null })
        .eq("id", currentRunId);
      console.log(`[data-engine] Pipeline ${currentRunId} completed`);
    }

    return new Response(
      JSON.stringify({ success: true, module: mod, runId: currentRunId, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[data-engine] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
