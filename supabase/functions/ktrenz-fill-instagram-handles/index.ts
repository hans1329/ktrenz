// ktrenz-fill-instagram-handles: 나무위키 페이지에서 인스타그램 핸들만 추출하여 social_handles에 병합
// Firecrawl API로 나무위키 스크래핑 → 정규식으로 instagram.com/핸들 추출
// DB 기반 오프셋 추적으로 배치 처리

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 10;
const PHASE_NAME = "fill_ig_handles";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || Deno.env.get("FIRECRAWL_API_KEY_1");

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dbHeaders = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // ── 1. 파이프라인 상태 조회/생성 ──
    const stateResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_pipeline_state?phase=eq.${PHASE_NAME}&status=eq.running&order=created_at.desc&limit=1`,
      { headers: dbHeaders }
    );
    const states = await stateResp.json();
    let state = states[0];

    if (!state) {
      // 대상: namuwiki_url이 있고 인스타 핸들이 아직 없는 활성 스타
      const countResp = await fetch(
        `${supabaseUrl}/rest/v1/ktrenz_stars?select=id&is_active=eq.true&namuwiki_url=neq.&or=(social_handles->>instagram.is.null,social_handles.is.null)`,
        { headers: { ...dbHeaders, Prefer: "count=exact, return=representation" } }
      );
      const countHeader = countResp.headers.get("content-range");
      const totalCandidates = countHeader ? parseInt(countHeader.split("/")[1]) || 0 : 0;

      if (totalCandidates === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No candidates to process", totalCandidates: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const runId = `fill_ig_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
      const createResp = await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          run_id: runId,
          phase: PHASE_NAME,
          status: "running",
          current_offset: 0,
          batch_size: BATCH_SIZE,
          total_candidates: totalCandidates,
        }),
      });
      const created = await createResp.json();
      state = created[0];
      console.log(`[fill-ig] New run: ${runId}, candidates: ${totalCandidates}`);
    }

    const currentOffset = state.current_offset || 0;
    const totalCandidates = state.total_candidates || 0;

    // ── 2. 배치 대상 조회 ──
    const starsResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name,namuwiki_url,social_handles&is_active=eq.true&namuwiki_url=neq.&or=(social_handles->>instagram.is.null,social_handles.is.null)&order=name_ko&offset=${currentOffset}&limit=${BATCH_SIZE}`,
      { headers: dbHeaders }
    );
    const stars = await starsResp.json();

    if (!stars || stars.length === 0) {
      await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state?id=eq.${state.id}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ status: "done", updated_at: new Date().toISOString() }),
      });
      return new Response(
        JSON.stringify({ success: true, message: "All candidates processed", phase: "done" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fill-ig] Batch: offset=${currentOffset}, count=${stars.length}`);

    // ── 3. Firecrawl로 나무위키 스크래핑 → 인스타 핸들 추출 ──
    const results: string[] = [];
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const star of stars) {
      try {
        const handle = await scrapeInstagramHandle(star.namuwiki_url, firecrawlKey);

        if (handle) {
          const existing = star.social_handles || {};
          const merged = { ...existing, instagram: handle };

          await fetch(`${supabaseUrl}/rest/v1/ktrenz_stars?id=eq.${star.id}`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify({ social_handles: merged }),
          });

          found++;
          results.push(`${star.name_ko || star.display_name}: ✅ @${handle}`);
          console.log(`[fill-ig] ${star.name_ko}: @${handle}`);
        } else {
          notFound++;
          results.push(`${star.name_ko || star.display_name}: ❌ no IG link`);
        }
      } catch (e) {
        errors++;
        const msg = (e as Error).message;
        results.push(`${star.name_ko || star.display_name}: ⚠️ ${msg}`);
        console.error(`[fill-ig] ${star.name_ko}: ${msg}`);
      }

      // Rate limit: Firecrawl 과부하 방지
      await new Promise((r) => setTimeout(r, 500));
    }

    // ── 4. 오프셋 업데이트 ──
    const newOffset = currentOffset + stars.length;
    const isDone = stars.length < BATCH_SIZE || newOffset >= totalCandidates;

    await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state?id=eq.${state.id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        current_offset: newOffset,
        status: isDone ? "done" : "running",
        updated_at: new Date().toISOString(),
      }),
    });

    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        batch_offset: currentOffset,
        processed: stars.length,
        found,
        not_found: notFound,
        errors,
        next_offset: isDone ? null : newOffset,
        is_done: isDone,
        progress: `${newOffset}/${totalCandidates}`,
        results,
        elapsed_ms: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fill-ig] Fatal:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Firecrawl로 나무위키 스크래핑 후 instagram.com/핸들 추출 ──
async function scrapeInstagramHandle(namuwikiUrl: string, apiKey: string): Promise<string | null> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: namuwikiUrl,
      formats: ["links"],
      onlyMainContent: true,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firecrawl ${resp.status}: ${errText.slice(0, 100)}`);
  }

  const data = await resp.json();
  const links: string[] = data?.data?.links || data?.links || [];

  // links 배열에서 instagram.com 링크 추출
  const EXCLUDE = new Set(["p", "explore", "reel", "stories", "accounts", "about", "developer", "legal", "api", "static", "help", "reels"]);
  const igHandles: string[] = [];

  for (const link of links) {
    const match = link.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})/i);
    if (match) {
      const handle = match[1].toLowerCase();
      if (!EXCLUDE.has(handle)) {
        igHandles.push(handle);
      }
    }
  }

  if (igHandles.length === 0) return null;

  // 빈도 기반 선택
  const freq = new Map<string, number>();
  for (const h of igHandles) {
    freq.set(h, (freq.get(h) || 0) + 1);
  }

  let best = igHandles[0];
  let bestCount = 0;
  for (const [h, c] of freq) {
    if (c > bestCount) {
      best = h;
      bestCount = c;
    }
  }

  return best;
}
