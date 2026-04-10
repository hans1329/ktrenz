// ktrenz-fill-naver-profile: 네이버 인물정보에서 직업(search_qualifier)과 인스타그램 핸들을 추출
// Firecrawl로 네이버 검색 프로필 페이지 스크래핑 → 정규식 파싱
// DB 기반 오프셋 추적으로 배치 처리 (API 안전 정책 준수)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5;
const PHASE_NAME = "fill_naver_profile";

// 직업 → search_qualifier 매핑
const PROFESSION_MAP: Record<string, string> = {
  "가수": "가수",
  "싱어송라이터": "가수",
  "래퍼": "래퍼",
  "힙합": "래퍼",
  "배우": "배우",
  "탤런트": "배우",
  "영화배우": "배우",
  "뮤지컬배우": "배우",
  "성우": "배우",
  "코미디언": "개그맨",
  "개그맨": "개그맨",
  "개그우먼": "개그맨",
  "유튜버": "유튜버",
  "크리에이터": "유튜버",
  "인터넷방송인": "유튜버",
  "모델": "모델",
  "MC": "방송인",
  "방송인": "방송인",
  "아나운서": "방송인",
  "프로듀서": "프로듀서",
  "작곡가": "작곡가",
  "작사가": "작곡가",
  "댄서": "댄서",
  "안무가": "댄서",
};

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

    // ── 요청 파라미터: force=true면 모든 활성 스타 대상, 아니면 search_qualifier가 기본값인 것만 ──
    let forceAll = false;
    try {
      const body = await req.json();
      forceAll = body?.force === true;
    } catch { /* no body */ }

    // ── 1. 파이프라인 상태 조회/생성 ──
    const stateResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_pipeline_state?phase=eq.${PHASE_NAME}&status=eq.running&order=created_at.desc&limit=1`,
      { headers: dbHeaders }
    );
    const states = await stateResp.json();
    let state = states[0];

    if (!state) {
      // 대상: search_qualifier가 기본값('가수')이거나, 인스타 핸들이 없는 활성 스타
      const filter = forceAll
        ? `is_active=eq.true`
        : `is_active=eq.true&or=(search_qualifier.eq.가수,search_qualifier.is.null,social_handles->>instagram.is.null,social_handles.is.null)`;

      const countResp = await fetch(
        `${supabaseUrl}/rest/v1/ktrenz_stars?select=id&${filter}`,
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

      const runId = `naver_prof_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
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
      console.log(`[naver-profile] New run: ${runId}, candidates: ${totalCandidates}`);
    }

    const currentOffset = state.current_offset || 0;
    const totalCandidates = state.total_candidates || 0;

    // ── 2. 배치 대상 조회 ──
    const filter = forceAll
      ? `is_active=eq.true`
      : `is_active=eq.true&or=(search_qualifier.eq.가수,search_qualifier.is.null,social_handles->>instagram.is.null,social_handles.is.null)`;

    const starsResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name,star_type,group_star_id,search_qualifier,social_handles&${filter}&order=name_ko&offset=${currentOffset}&limit=${BATCH_SIZE}`,
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

    // 그룹명 조회 (멤버 타입용)
    const groupIds = [...new Set(stars.filter((s: any) => s.star_type === "member" && s.group_star_id).map((s: any) => s.group_star_id))];
    const groupNameMap = new Map<string, string>();
    if (groupIds.length > 0) {
      const gResp = await fetch(
        `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name&id=in.(${groupIds.join(",")})`,
        { headers: dbHeaders }
      );
      const groups = await gResp.json();
      for (const g of groups || []) {
        groupNameMap.set(g.id, g.name_ko || g.display_name);
      }
    }

    console.log(`[naver-profile] Batch: offset=${currentOffset}, count=${stars.length}`);

    // ── 3. Firecrawl로 네이버 프로필 스크래핑 ──
    const results: string[] = [];
    let qualifierUpdated = 0;
    let igUpdated = 0;
    let errors = 0;

    for (const star of stars) {
      try {
        const searchName = star.name_ko || star.display_name;
        // 멤버인 경우 그룹명 포함
        let searchQuery = searchName;
        if (star.star_type === "member" && star.group_star_id) {
          const groupName = groupNameMap.get(star.group_star_id);
          if (groupName) searchQuery = `${groupName} ${searchName}`;
        }

        const profileData = await scrapeNaverProfile(searchQuery, firecrawlKey);

        const updates: Record<string, any> = {};
        const updateNotes: string[] = [];

        // search_qualifier 업데이트
        if (profileData.profession) {
          const qualifier = mapProfession(profileData.profession);
          if (qualifier && qualifier !== star.search_qualifier) {
            updates.search_qualifier = qualifier;
            qualifierUpdated++;
            updateNotes.push(`직업: ${qualifier}`);
          }
        }

        // 인스타그램 핸들 업데이트
        if (profileData.instagram) {
          const existing = star.social_handles || {};
          const currentIg = existing.instagram;
          // 기존 핸들이 없거나 unverified인 경우만 업데이트
          if (!currentIg || existing.instagram_unverified === "true") {
            const merged = { ...existing, instagram: profileData.instagram };
            // unverified 플래그 제거 (네이버는 공식 정보이므로)
            delete merged.instagram_unverified;
            updates.social_handles = merged;
            igUpdated++;
            updateNotes.push(`IG: @${profileData.instagram}`);
          }
        }

        if (Object.keys(updates).length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/ktrenz_stars?id=eq.${star.id}`, {
            method: "PATCH",
            headers: dbHeaders,
            body: JSON.stringify(updates),
          });
          results.push(`${searchName}: ✅ ${updateNotes.join(", ")}`);
        } else {
          results.push(`${searchName}: ⏭️ no updates needed`);
        }
      } catch (e) {
        errors++;
        const msg = (e as Error).message;
        results.push(`${star.name_ko || star.display_name}: ⚠️ ${msg}`);
        console.error(`[naver-profile] ${star.name_ko}: ${msg}`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 1000));
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
        qualifier_updated: qualifierUpdated,
        ig_updated: igUpdated,
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
    console.error("[naver-profile] Fatal:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── 직업 텍스트 → search_qualifier 매핑 ──
function mapProfession(professionText: string): string | null {
  // "가수, 탤런트" 같은 형태에서 첫 번째 매칭되는 직업 사용
  for (const [keyword, qualifier] of Object.entries(PROFESSION_MAP)) {
    if (professionText.includes(keyword)) {
      return qualifier;
    }
  }
  return null;
}

// ── Firecrawl로 네이버 프로필 페이지 스크래핑 ──
async function scrapeNaverProfile(
  searchQuery: string,
  apiKey: string
): Promise<{ profession: string | null; instagram: string | null }> {
  const naverUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(searchQuery + " 프로필")}`;

  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: naverUrl,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 2000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firecrawl ${resp.status}: ${errText.slice(0, 100)}`);
  }

  const data = await resp.json();
  const markdown: string = data?.data?.markdown || data?.markdown || "";

  if (!markdown) {
    return { profession: null, instagram: null };
  }

  // ── 프로필 섹션만 추출 (## **이름** ~ 다음 ## 또는 끝) ──
  // 네이버 인물정보 패널은 "## **이름**펴고 접기" 형태로 시작
  const profileMatch = markdown.match(/##\s*\*{2}[^*]+\*{2}[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|\n\*{3,}|$)/);
  const profileSection = profileMatch ? profileMatch[0] : "";

  if (!profileSection) {
    console.log(`[naver-profile] No profile section found for query`);
    return { profession: null, instagram: null };
  }

  // 1. 직업 추출 - 프로필 섹션 내에서만
  let profession: string | null = null;
  const PROF_KEYWORDS = "가수|배우|탤런트|래퍼|유튜버|코미디언|개그맨|모델|방송인|싱어송라이터|MC|아나운서|댄서|안무가|크리에이터|프로듀서|작곡가|인터넷방송인|영화배우|뮤지컬배우|성우|힙합|개그우먼";

  // 패턴: "JEON WOONG가수" 또는 "이지은, IU가수, 탤런트" - 프로필 헤더 바로 아래
  const profRegex = new RegExp(`[A-Za-z\\s,]+(?:${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`);
  const profMatch = profileSection.match(profRegex);
  if (profMatch) {
    // 영문이름 부분 제거하고 직업만 추출
    const fullMatch = profMatch[0];
    const profOnly = fullMatch.match(new RegExp(`(${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`));
    if (profOnly) {
      profession = profOnly[0].trim();
    }
  }

  // fallback: 프로필 섹션 내 첫 번째 직업 키워드 (단독 등장)
  if (!profession) {
    const simpleMatch = profileSection.match(new RegExp(`(?:^|\\n|\\s)(${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`, "m"));
    if (simpleMatch) {
      profession = simpleMatch[0].trim();
    }
  }

  // 2. 인스타그램 핸들 추출 - 프로필 섹션 내에서만
  let instagram: string | null = null;
  const igMatch = profileSection.match(/인스타그램[^\n]*\]\(https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})\)/i);
  if (igMatch) {
    instagram = igMatch[1].toLowerCase();
  }

  // fallback: 프로필 섹션 내 instagram.com 링크
  if (!instagram) {
    const igLinkMatch = profileSection.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})/i);
    if (igLinkMatch) {
      const handle = igLinkMatch[1].toLowerCase();
      const EXCLUDE = new Set(["p", "explore", "reel", "stories", "accounts", "about", "developer", "legal", "api", "static", "help", "reels"]);
      if (!EXCLUDE.has(handle)) {
        instagram = handle;
      }
    }
  }

  return { profession, instagram };
}
