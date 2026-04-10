// Manual Keyword Addition: 관리자가 스타+키워드 조합을 수동 등록하고 전체 파이프라인을 트리거
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { star_id, keyword, keyword_category, context } = body;

    if (!star_id || !keyword?.trim()) {
      return new Response(
        JSON.stringify({ error: "star_id and keyword are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. 스타 정보 조회
    const { data: star, error: starErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_type, group_star_id")
      .eq("id", star_id)
      .single();

    if (starErr || !star) {
      return new Response(
        JSON.stringify({ error: "Star not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const kwTrimmed = keyword.trim();
    const kwLower = kwTrimmed.toLowerCase();
    const category = keyword_category || "event";
    const contextText = context?.trim() || `관리자 수동 등록: ${star.display_name} - ${kwTrimmed}`;

    // 2. 기존 키워드 중복 확인
    const { data: existing } = await sb
      .from("ktrenz_keywords")
      .select("id, keyword")
      .or(`keyword.ilike.${kwTrimmed},keyword_ko.ilike.${kwTrimmed},keyword_en.ilike.${kwTrimmed}`)
      .eq("status", "active")
      .limit(1);

    let keywordId: string;
    let isNew = false;

    if (existing?.length) {
      keywordId = existing[0].id;
      console.log(`[manual-keyword] Keyword "${kwTrimmed}" already exists (${keywordId}), adding source`);
    } else {
      // 3. 새 키워드 삽입
      const kwRow = {
        keyword: kwTrimmed,
        keyword_ko: kwTrimmed,
        keyword_en: null,
        keyword_ja: null,
        keyword_zh: null,
        keyword_category: category,
        status: "active",
        unified_score: 0,
        metadata: { manual: true },
      };
      const { data: inserted, error: insertErr } = await sb
        .from("ktrenz_keywords")
        .insert(kwRow)
        .select("id")
        .single();

      if (insertErr) {
        console.error(`[manual-keyword] Keyword insert error: ${insertErr.message}`);
        return new Response(
          JSON.stringify({ error: `Insert failed: ${insertErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      keywordId = inserted.id;
      isNew = true;
      console.log(`[manual-keyword] New keyword "${kwTrimmed}" created (${keywordId})`);
    }

    // 4. 소스 연결 추가
    const sourceRow = {
      keyword_id: keywordId,
      star_id: star.id,
      source_type: "manual",
      source_url: null,
      source_title: `수동 등록: ${star.display_name}`,
      source_snippet: contextText,
      confidence: 1.0,
      detected_at: new Date().toISOString(),
    };
    await sb.from("ktrenz_keyword_sources").insert(sourceRow);

    // 5. 트렌드 트리거 생성
    const triggerRow = {
      star_id: star.id,
      trigger_type: "manual",
      trigger_source: "admin",
      artist_name: star.display_name,
      keyword: kwTrimmed,
      keyword_ko: kwTrimmed,
      keyword_en: null,
      keyword_ja: null,
      keyword_zh: null,
      keyword_category: category,
      context: contextText,
      context_ko: contextText,
      confidence: 1.0,
      commercial_intent: "organic",
      fan_sentiment: "neutral",
      trend_potential: 50,
      baseline_score: 0,
      peak_score: 0,
      status: "active",
      metadata: { keyword_id: keywordId, manual: true },
    };
    const { data: trigger, error: trigErr } = await sb
      .from("ktrenz_trend_triggers")
      .insert(triggerRow)
      .select("id")
      .single();

    if (trigErr) {
      console.error(`[manual-keyword] Trigger insert error: ${trigErr.message}`);
    }

    // 6. 이미지 캐시 (fire-and-forget)
    if (trigger?.id) {
      fetch(`${supabaseUrl}/functions/v1/ktrenz-cache-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ triggerIds: [trigger.id] }),
      }).catch(() => {});
    }

    // 7. 트래킹 실행 (해당 키워드만)
    const trackResult = await fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-track`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ triggerId: trigger?.id, batchSize: 1 }),
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    console.log(`[manual-keyword] Track result:`, JSON.stringify(trackResult));

    // 8. 등급 산정 (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-grade`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        isNew,
        keywordId,
        triggerId: trigger?.id ?? null,
        star: star.display_name,
        keyword: kwTrimmed,
        trackResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`[manual-keyword] Error: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
