// data-engine: 데이터 수집 오케스트레이터
// 모듈: youtube, music, hanteo, buzz, energy
// 모드: 개별 모듈 또는 "all" (체이닝 + 타임시프트)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPELINE = ["youtube", "music", "hanteo", "buzz", "energy"] as const;
type Module = typeof PIPELINE[number];

// 모듈 완료 후 다음 모듈 시작까지 대기 시간 (초)
const DELAY_AFTER: Record<Module, number> = {
  youtube: 10,   // YouTube 완료 후 10초 대기 → Music
  music: 10,     // Music 완료 후 10초 → Hanteo
  hanteo: 10,    // Hanteo 완료 후 10초 → Buzz
  buzz: 30,      // Buzz 런칭 후 30초 대기 → Energy (buzz는 fire-and-forget이라 빠름)
  energy: 0,
};

// ── 모듈 실행기 ──

function launchCollector(
  supabaseUrl: string,
  serviceKey: string,
  source: "youtube" | "music" | "hanteo",
) {
  const reqPromise = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ source }),
  }).catch((e) => console.warn(`[data-engine] ${source} fire error:`, e.message));

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(reqPromise);
  }
}

async function runYouTube(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running YouTube module (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "youtube");
  return { status: "launched", module: "youtube" };
}

async function runMusic(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running Music module (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "music");
  return { status: "launched", module: "music" };
}

async function runHanteo(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running Hanteo module (fire-and-forget)...");
  launchCollector(supabaseUrl, serviceKey, "hanteo");
  return { status: "launched", module: "hanteo" };
}

async function runBuzz(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running Buzz module (fire-and-forget batches)...");
  // buzz-cron을 배치별로 fire-and-forget 발사
  const BATCH_SIZE = 5;
  const TOTAL_BATCHES = 12; // 58 artists / 5 per batch
  let launched = 0;

  for (let i = 0; i < TOTAL_BATCHES; i++) {
    fetch(`${supabaseUrl}/functions/v1/buzz-cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE }),
    }).catch((e) => console.warn(`[data-engine] Buzz batch ${i} fire error:`, e.message));
    launched++;
    // 배치 간 2초 간격 (Firecrawl rate limit)
    if (i < TOTAL_BATCHES - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`[data-engine] Buzz: launched ${launched} batches`);
  return { launched, batchSize: BATCH_SIZE, totalBatches: TOTAL_BATCHES };
}

async function runEnergy(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Running Energy module...");
  const resp = await fetch(`${supabaseUrl}/functions/v1/calculate-energy-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({}),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

const MODULE_RUNNERS: Record<Module, (url: string, key: string) => Promise<any>> = {
  youtube: runYouTube,
  music: runMusic,
  hanteo: runHanteo,
  buzz: runBuzz,
  energy: runEnergy,
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
    const { module = "all", runId, chain } = body as {
      module?: string;
      runId?: string;
      chain?: string[];
    };

    const currentRunId = runId || crypto.randomUUID();

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

      // 첫 모듈을 체이닝으로 시작 (fire-and-forget)
      const remaining = [...PIPELINE].slice(1);
      fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: PIPELINE[0], runId: currentRunId, chain: remaining }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          runId: currentRunId,
          message: `Pipeline started: ${PIPELINE.join(" → ")}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 개별 모듈 실행 ──
    const mod = module as Module;
    if (!MODULE_RUNNERS[mod]) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown module: ${module}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 진행 상태 업데이트
    if (runId) {
      await sb.from("ktrenz_engine_runs")
        .update({ current_module: mod })
        .eq("id", currentRunId);
    }

    console.log(`[data-engine] Executing module: ${mod} (run: ${currentRunId})`);

    let result: any = {};
    try {
      result = await MODULE_RUNNERS[mod](supabaseUrl, serviceKey);
      console.log(`[data-engine] Module ${mod} completed:`, JSON.stringify(result).slice(0, 300));
    } catch (e) {
      console.error(`[data-engine] Module ${mod} failed:`, e);
      result = { error: (e as Error).message };
    }

    // 결과를 DB에 기록
    if (runId) {
      const { data: currentRun } = await sb
        .from("ktrenz_engine_runs")
        .select("results")
        .eq("id", currentRunId)
        .maybeSingle();

      const updatedResults = { ...(currentRun?.results as any || {}), [mod]: result };
      await sb.from("ktrenz_engine_runs")
        .update({ results: updatedResults })
        .eq("id", currentRunId);
    }

    // ── 체이닝: 다음 모듈 트리거 ──
    if (chain && chain.length > 0) {
      const nextModule = chain[0] as Module;
      const remainingChain = chain.slice(1);
      const delaySec = DELAY_AFTER[mod] || 10;

      console.log(`[data-engine] Chaining → ${nextModule} after ${delaySec}s`);
      await new Promise(r => setTimeout(r, delaySec * 1000));

      fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: nextModule, runId: currentRunId, chain: remainingChain }),
      }).catch(() => {});
    } else if (runId && !chain?.length) {
      // 파이프라인 완료
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
