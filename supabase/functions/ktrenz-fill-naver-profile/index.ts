// ktrenz-fill-naver-profile: 네이버 인물정보에서 직업(search_qualifier)과 소셜 핸들(IG/YT/X/TikTok)을 추출
// Firecrawl로 네이버 검색 프로필 페이지 스크래핑 → 정규식 파싱
// DB 기반 오프셋 추적으로 배치 처리 (API 안전 정책 준수)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5;
const PHASE_NAME = "fill_naver_profile";

// 직업 → search_qualifier 매핑 (플랫폼 star_category에 맞춤)
// 플랫폼 분류: kpop, actor, singer, baseball, athlete, chef, politician, influencer, comedian, other
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
  "MC": "방송인",
  "방송인": "방송인",
  "아나운서": "방송인",
  "프로듀서": "프로듀서",
  "작곡가": "작곡가",
  "작사가": "작곡가",
  "댄서": "댄서",
  "안무가": "댄서",
};

type ProfileData = {
  profession: string | null;
  instagram: string | null;
  youtube: string | null;
  x: string | null;
  tiktok: string | null;
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

    // ── 요청 파라미터 ──
    let forceAll = false;
    let testStarIds: string[] | null = null;
    let dryRun = false;
    try {
      const body = await req.json();
      forceAll = body?.force === true;
      testStarIds = body?.testStarIds || null;
      dryRun = body?.dryRun === true;
    } catch { /* no body */ }

    // ── 테스트 모드: 특정 스타만 처리 (파이프라인 상태 무시) ──
    if (testStarIds && testStarIds.length > 0) {
      const starsResp = await fetch(
        `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name,star_type,group_star_id,search_qualifier,social_handles&id=in.(${testStarIds.join(",")})`,
        { headers: dbHeaders }
      );
      const stars = await starsResp.json();

      const groupNameMap = await resolveGroupNames(stars, supabaseUrl, dbHeaders);

      const results: any[] = [];
      for (const star of stars) {
        const searchName = star.name_ko || star.display_name;
        const searchQuery = buildSearchQuery(star, groupNameMap);
        let profileData = await scrapeNaverProfile(searchQuery, firecrawlKey);

        // 폴백: 그룹명+이름으로 못 찾으면 이름만으로 재시도
        if (!profileData.profession && !profileData.instagram && !profileData.youtube && searchQuery !== searchName) {
          console.log(`[naver-profile] Fallback: retrying with name only "${searchName}"`);
          await new Promise((r) => setTimeout(r, 1000));
          profileData = await scrapeNaverProfile(searchName, firecrawlKey);
        }

        const qualifier = profileData.profession ? mapProfession(profileData.profession) : null;

        const socialUpdates = buildSocialUpdates(star.social_handles || {}, profileData);
        
        results.push({
          name: star.name_ko || star.display_name,
          searchQuery,
          currentQualifier: star.search_qualifier,
          detectedProfession: profileData.profession,
          mappedQualifier: qualifier,
          social: {
            instagram: profileData.instagram,
            youtube: profileData.youtube,
            x: profileData.x,
            tiktok: profileData.tiktok,
          },
          currentSocial: star.social_handles,
          socialUpdated: Object.keys(socialUpdates.changes).length > 0 ? socialUpdates.changes : null,
        });

        if (!dryRun) {
          const updates: Record<string, any> = {};
          if (qualifier && qualifier !== star.search_qualifier) updates.search_qualifier = qualifier;
          if (Object.keys(socialUpdates.changes).length > 0) {
            updates.social_handles = socialUpdates.merged;
          }
          if (Object.keys(updates).length > 0) {
            await fetch(`${supabaseUrl}/rest/v1/ktrenz_stars?id=eq.${star.id}`, {
              method: "PATCH", headers: dbHeaders, body: JSON.stringify(updates),
            });
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      return new Response(
        JSON.stringify({ success: true, mode: dryRun ? "dry_run" : "test", results, elapsed_ms: Date.now() - startTime }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 1. 파이프라인 상태 조회/생성 ──
    const stateResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_pipeline_state?phase=eq.${PHASE_NAME}&status=eq.running&order=created_at.desc&limit=1`,
      { headers: dbHeaders }
    );
    const states = await stateResp.json();
    let state = states[0];

    if (!state) {
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

    const groupNameMap = await resolveGroupNames(stars, supabaseUrl, dbHeaders);

    console.log(`[naver-profile] Batch: offset=${currentOffset}, count=${stars.length}`);

    // ── 3. Firecrawl로 네이버 프로필 스크래핑 ──
    const results: string[] = [];
    let qualifierUpdated = 0;
    let socialUpdatedCount = 0;
    let errors = 0;

    for (const star of stars) {
      try {
        const searchName = star.name_ko || star.display_name;
        const searchQuery = buildSearchQuery(star, groupNameMap);
        let profileData = await scrapeNaverProfile(searchQuery, firecrawlKey);

        // 폴백: 그룹명+이름으로 못 찾으면 이름만으로 재시도
        if (!profileData.profession && !profileData.instagram && !profileData.youtube && searchQuery !== searchName) {
          console.log(`[naver-profile] Fallback: retrying with name only "${searchName}"`);
          await new Promise((r) => setTimeout(r, 1000));
          profileData = await scrapeNaverProfile(searchName, firecrawlKey);
        }

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

        // 소셜 핸들 업데이트 (instagram, youtube, x, tiktok)
        const socialResult = buildSocialUpdates(star.social_handles || {}, profileData);
        if (Object.keys(socialResult.changes).length > 0) {
          updates.social_handles = socialResult.merged;
          socialUpdatedCount++;
          for (const [key, val] of Object.entries(socialResult.changes)) {
            updateNotes.push(`${key}: ${val}`);
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
        social_updated: socialUpdatedCount,
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

// ── 헬퍼: 검색 쿼리 생성 ──
function buildSearchQuery(star: any, groupNameMap: Map<string, string>): string {
  const searchName = star.name_ko || star.display_name;
  if (star.star_type === "member" && star.group_star_id) {
    const groupName = groupNameMap.get(star.group_star_id);
    if (groupName) return `${groupName} ${searchName}`;
  }
  return searchName;
}

// ── 헬퍼: 그룹명 조회 ──
async function resolveGroupNames(stars: any[], supabaseUrl: string, dbHeaders: Record<string, string>): Promise<Map<string, string>> {
  const groupIds = [...new Set(stars.filter((s: any) => s.star_type === "member" && s.group_star_id).map((s: any) => s.group_star_id))];
  const map = new Map<string, string>();
  if (groupIds.length > 0) {
    const gResp = await fetch(
      `${supabaseUrl}/rest/v1/ktrenz_stars?select=id,name_ko,display_name&id=in.(${groupIds.join(",")})`,
      { headers: dbHeaders }
    );
    const groups = await gResp.json();
    for (const g of groups || []) map.set(g.id, g.name_ko || g.display_name);
  }
  return map;
}

// ── 헬퍼: 소셜 핸들 업데이트 빌드 ──
function buildSocialUpdates(
  existing: Record<string, any>,
  profileData: ProfileData
): { merged: Record<string, any>; changes: Record<string, string> } {
  const merged = { ...existing };
  const changes: Record<string, string> = {};

  // 빈값/_not_found/unverified이면 무조건 업데이트, 기존 값과 다르면 덮어쓰기
  const shouldUpdate = (key: string, newVal: string | null): boolean => {
    if (!newVal) return false;
    const current = existing[key];
    if (!current || current === "_not_found" || existing[`${key}_unverified`] === "true") return true;
    // 기존 값과 다르면 네이버 감지 값으로 덮어쓰기
    if (current !== newVal) return true;
    return false;
  };

  if (shouldUpdate("instagram", profileData.instagram)) {
    merged.instagram = profileData.instagram;
    delete merged.instagram_unverified;
    delete merged.instagram_checked_at;
    changes.IG = `@${profileData.instagram}`;
  }

  if (shouldUpdate("youtube", profileData.youtube)) {
    merged.youtube = profileData.youtube;
    changes.YT = profileData.youtube!;
  }

  if (shouldUpdate("x", profileData.x)) {
    merged.x = profileData.x;
    changes.X = `@${profileData.x}`;
  }

  if (shouldUpdate("tiktok", profileData.tiktok)) {
    merged.tiktok = profileData.tiktok;
    changes.TT = `@${profileData.tiktok}`;
  }

  return { merged, changes };
}

// ── 직업 텍스트 → search_qualifier 매핑 ──
function mapProfession(professionText: string): string | null {
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
): Promise<ProfileData> {
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
    return { profession: null, instagram: null, youtube: null, x: null, tiktok: null };
  }

  // ── 프로필 섹션만 추출 (## **이름** ~ 다음 ## 또는 끝) ──
  const profileMatch = markdown.match(/##\s*\*{2}[^*]+\*{2}[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|\n\*{3,}|$)/);
  const profileSection = profileMatch ? profileMatch[0] : "";

  if (!profileSection) {
    console.log(`[naver-profile] No profile section found for: ${searchQuery}`);
    return { profession: null, instagram: null, youtube: null, x: null, tiktok: null };
  }

  // ── 1. 직업 추출 ──
  let profession: string | null = null;
  const PROF_KEYWORDS = "가수|배우|탤런트|래퍼|유튜버|코미디언|개그맨|방송인|싱어송라이터|MC|아나운서|댄서|안무가|크리에이터|프로듀서|작곡가|인터넷방송인|영화배우|뮤지컬배우|성우|힙합|개그우먼";

  // 패턴: "JEON WOONG가수" - 영문이름 바로 뒤에 직업
  const profRegex = new RegExp(`[A-Za-z\\s,]+(?:${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`);
  const profMatch2 = profileSection.match(profRegex);
  if (profMatch2) {
    const profOnly = profMatch2[0].match(new RegExp(`(${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`));
    if (profOnly) profession = profOnly[0].trim();
  }

  // fallback: 프로필 섹션 내 첫 번째 직업 키워드
  if (!profession) {
    const simpleMatch = profileSection.match(new RegExp(`(?:^|\\n|\\s)(${PROF_KEYWORDS})(?:[,\\s]*(?:${PROF_KEYWORDS}))*`, "m"));
    if (simpleMatch) profession = simpleMatch[0].trim();
  }

  // ── 2. 소셜 핸들 추출 (프로필 섹션 내) ──
  // 인스타그램
  let instagram: string | null = null;
  const igMatch = profileSection.match(/인스타그램[^\n]*?\]\(https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})\)/i)
    || profileSection.match(/instagram\.com\/([a-zA-Z0-9_.]{2,30})/i);
  if (igMatch) {
    const handle = igMatch[1].toLowerCase();
    const EXCLUDE_IG = new Set(["p", "explore", "reel", "stories", "accounts", "about", "developer", "legal", "api", "static", "help", "reels"]);
    if (!EXCLUDE_IG.has(handle)) instagram = handle;
  }

  // 유튜브 채널 ID
  let youtube: string | null = null;
  const ytMatch = profileSection.match(/유튜브[^\n]*?\]\(https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_\-]{2,50})\)/i)
    || profileSection.match(/youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_\-]{2,50})/i);
  if (ytMatch) youtube = ytMatch[1];

  // X (트위터)
  let x: string | null = null;
  const xMatch = profileSection.match(/(?:X\(트위터\)|트위터|X)[^\n]*?\]\(https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{2,30})\)/i)
    || profileSection.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{2,30})/i);
  if (xMatch) {
    const handle = xMatch[1].toLowerCase();
    const EXCLUDE_X = new Set(["home", "explore", "search", "settings", "i", "intent", "login", "signup"]);
    if (!EXCLUDE_X.has(handle)) x = handle;
  }

  // 틱톡
  let tiktok: string | null = null;
  const ttMatch = profileSection.match(/틱톡[^\n]*?\]\(https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]{2,30})\)/i)
    || profileSection.match(/tiktok\.com\/@([a-zA-Z0-9_.]{2,30})/i);
  if (ttMatch) tiktok = ttMatch[1].toLowerCase();

  return { profession, instagram, youtube, x, tiktok };
}
