// ktrenz-fill-instagram-handles: 나무위키 페이지에서 인스타그램 핸들만 추출하여 social_handles에 병합
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

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // ── 1. 파이프라인 상태 조회/생성 ──
    let stateResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_pipeline_state?phase=eq.${PHASE_NAME}&status=eq.running&order=created_at.desc&limit=1`,
      { headers }
    );
    let states = await stateResp.json();
    let state = states[0];

    if (!state) {
      // 대상 수 조회: namuwiki_url이 있고 인스타 핸들이 아직 없는 스타
      const countResp = await fetch(
        `${supabaseUrl}/rest/v1/ktrenz_stars?select=id&is_active=eq.true&namuwiki_url=neq.&or=(social_handles->instagram.is.null,social_handles.is.null)&limit=1000`,
        { headers: { ...headers, Prefer: "count=exact" } }
      );
      const countHeader = countResp.headers.get("content-range");
      const totalCandidates = countHeader ? parseInt(countHeader.split("/")[1]) || 0 : 0;
      
      if (totalCandidates === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "No candidates to process", totalCandidates: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 새 run 생성
      const runId = `fill_ig_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
      const createResp = await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state`, {
        method: "POST",
        headers,
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
      console.log(`[fill-ig] New run created: ${runId}, candidates: ${totalCandidates}`);
    }

    const currentOffset = state.current_offset || 0;
    const totalCandidates = state.total_candidates || 0;

    // ── 2. 배치 대상 조회 ──
    const starsResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name,namuwiki_url,social_handles&is_active=eq.true&namuwiki_url=neq.&or=(social_handles->instagram.is.null,social_handles.is.null)&order=name_ko&offset=${currentOffset}&limit=${BATCH_SIZE}`,
      { headers }
    );
    const stars = await starsResp.json();

    if (!stars || stars.length === 0) {
      // 완료 처리
      await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state?id=eq.${state.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "done", updated_at: new Date().toISOString() }),
      });
      return new Response(
        JSON.stringify({ success: true, message: "All candidates processed", phase: "done" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fill-ig] Processing batch: offset=${currentOffset}, count=${stars.length}`);

    // ── 3. 각 스타의 나무위키 페이지에서 인스타 핸들 추출 ──
    const results: any[] = [];
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const star of stars) {
      try {
        const handle = await extractInstagramFromNamu(star.namuwiki_url);
        
        if (handle) {
          // social_handles에 instagram만 병합
          const existing = star.social_handles || {};
          const merged = { ...existing, instagram: handle };
          
          await fetch(`${supabaseUrl}/rest/v1/ktrenz_stars?id=eq.${star.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ social_handles: merged }),
          });
          
          found++;
          results.push(`${star.name_ko || star.display_name}: ✅ ${handle}`);
          console.log(`[fill-ig] ${star.name_ko}: found @${handle}`);
        } else {
          notFound++;
          results.push(`${star.name_ko || star.display_name}: ❌ no instagram link`);
        }
      } catch (e) {
        errors++;
        results.push(`${star.name_ko || star.display_name}: ⚠️ ${(e as Error).message}`);
        console.error(`[fill-ig] Error for ${star.name_ko}: ${(e as Error).message}`);
      }
    }

    // ── 4. 오프셋 업데이트 ──
    const newOffset = currentOffset + stars.length;
    const isDone = stars.length < BATCH_SIZE || newOffset >= totalCandidates;
    
    await fetch(`${supabaseUrl}/rest/v1/ktrenz_pipeline_state?id=eq.${state.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        current_offset: newOffset,
        status: isDone ? "done" : "running",
        updated_at: new Date().toISOString(),
      }),
    });

    const elapsed = Date.now() - startTime;
    console.log(`[fill-ig] Batch done: found=${found}, notFound=${notFound}, errors=${errors}, elapsed=${elapsed}ms`);

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
    console.error("[fill-ig] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── 나무위키 HTML에서 instagram.com/핸들 패턴 추출 ──
async function extractInstagramFromNamu(namuwikiUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(namuwikiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const html = await resp.text();

    // instagram.com/핸들 패턴 추출 (staff/p/explore 등 제외)
    const igPattern = /instagram\.com\/([a-zA-Z0-9_.]{2,30})/gi;
    const matches = new Set<string>();
    let match;
    
    while ((match = igPattern.exec(html)) !== null) {
      const handle = match[1].toLowerCase();
      // 일반 경로 제외
      if (!["p", "explore", "reel", "stories", "accounts", "about", "developer", "legal", "api", "static", "help"].includes(handle)) {
        matches.add(handle);
      }
    }

    if (matches.size === 0) return null;

    // 여러 개면 가장 많이 등장한 것 선택 (보통 프로필 링크)
    const counts = new Map<string, number>();
    while ((match = igPattern.exec(html)) !== null) {
      // 이미 추출 완료
    }
    
    // 정규식 재실행하여 빈도 체크
    const igPattern2 = /instagram\.com\/([a-zA-Z0-9_.]{2,30})/gi;
    while ((match = igPattern2.exec(html)) !== null) {
      const h = match[1].toLowerCase();
      if (!["p", "explore", "reel", "stories", "accounts", "about", "developer", "legal", "api", "static", "help"].includes(h)) {
        counts.set(h, (counts.get(h) || 0) + 1);
      }
    }

    // 가장 빈도 높은 핸들 반환
    let best = "";
    let bestCount = 0;
    for (const [h, c] of counts) {
      if (c > bestCount) {
        best = h;
        bestCount = c;
      }
    }

    return best || matches.values().next().value || null;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
