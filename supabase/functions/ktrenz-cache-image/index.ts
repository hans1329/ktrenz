// 외부 뉴스 이미지를 Supabase Storage에 캐시하여 핫링크 차단 우회
// 감지 직후 또는 배치 백필로 호출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "trend-images";

// og:image가 이 크기(바이트) 이하면 저해상도로 판단 → 본문 이미지에서 더 큰 것을 찾는다
const LOW_RES_THRESHOLD_BYTES = 30_000; // 30KB

// 이미지 다운로드가 불가능한 도메인 블랙리스트 (봇 차단, 핫링크 차단 등)
const IMAGE_DOMAIN_BLACKLIST = [
  "ddaily.co.kr",
  "fbcdn.net",
  "cdninstagram.com",
  "scontent.",
];

// URL 정규화: HTML 엔티티 디코딩
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, "&");
}

async function downloadImage(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": new URL(url).origin + "/",
      },
    });

    if (!res.ok) {
      console.warn(`[cache-image] Failed to fetch ${url}: ${res.status}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.warn(`[cache-image] Not an image: ${contentType} for ${url}`);
      return null;
    }

    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length < 500) {
      console.warn(`[cache-image] Image too small (${data.length}b), likely placeholder: ${url}`);
      return null;
    }

    return { data, contentType };
  } catch (e) {
    console.error(`[cache-image] Download error for ${url}:`, e.message);
    return null;
  }
}

// 아티스트/키워드 이름 변형 생성 (매칭용)
function buildNameVariants(artistName: string | null, keyword: string | null): string[] {
  const variants: string[] = [];
  for (const name of [artistName, keyword]) {
    if (!name) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    variants.push(trimmed.toLowerCase());
    // 공백 제거 버전
    const noSpace = trimmed.replace(/\s+/g, "").toLowerCase();
    if (noSpace !== trimmed.toLowerCase()) variants.push(noSpace);
    // 괄호 안 이름 추출 (e.g. "엔믹스(NMIXX)" → "NMIXX")
    for (const m of trimmed.matchAll(/\(([^)]+)\)/g)) {
      const inner = m[1]?.trim().toLowerCase();
      if (inner) variants.push(inner);
    }
    // 괄호 제거 버전
    const noParen = trimmed.replace(/\([^)]*\)/g, "").trim().toLowerCase();
    if (noParen && noParen !== trimmed.toLowerCase()) variants.push(noParen);
  }
  return [...new Set(variants)].filter(v => v.length >= 2);
}

// 텍스트에 이름 변형 중 하나라도 포함되는지 확인
function textMatchesNames(text: string, nameVariants: string[]): boolean {
  if (!text || nameVariants.length === 0) return false;
  const lower = text.toLowerCase();
  return nameVariants.some(v => lower.includes(v));
}

// URL이 유효한 이미지 URL인지 검증하고 정규화
function resolveImageUrl(src: string, pageUrl: string): string | null {
  if (!src) return null;
  if (/\.(gif|svg|ico)(\?|$)/i.test(src)) return null;
  if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner|emoticon|emoji/i.test(src)) return null;

  let resolved = src.replace(/&amp;/g, "&");
  if (resolved.startsWith("//")) resolved = "https:" + resolved;
  else if (resolved.startsWith("/")) {
    try { resolved = new URL(resolved, pageUrl).href; } catch { return null; }
  }
  if (!resolved.startsWith("https://")) return null;
  if (IMAGE_DOMAIN_BLACKLIST.some(domain => resolved.includes(domain))) return null;
  return resolved;
}

// 본문 HTML에서 이미지 후보를 추출 — <img src>, srcset, data-src, 인라인 URL 패턴 모두 지원
// SPA 등 <img> 태그가 없는 사이트에서도 이미지를 찾을 수 있도록 확장
// nameVariants가 빈 배열이면 (이름 정보 없으면) 기존처럼 전부 반환
async function fetchBodyImageCandidates(
  pageUrl: string,
  nameVariants: string[] = [],
): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return [];

    // 본문 앞 200KB 읽기 (SPA 사이트는 JSON/인라인 데이터가 길 수 있음)
    const reader = res.body?.getReader();
    if (!reader) return [];
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const hasFilter = nameVariants.length > 0;
    const matched: string[] = [];
    const unmatched: string[] = [];
    const seenUrls = new Set<string>();

    function addCandidate(resolved: string, contextText: string) {
      if (seenUrls.has(resolved)) return;
      seenUrls.add(resolved);

      if (!hasFilter) {
        matched.push(resolved);
        return;
      }
      if (textMatchesNames(contextText, nameVariants)) {
        matched.push(resolved);
        console.log(`[cache-image] ✓ Name-matched image: ctx="${contextText.slice(0, 60)}" → ${resolved.slice(0, 80)}`);
      } else {
        unmatched.push(resolved);
      }
    }

    // ── 1단계: <img> 태그 파싱 (src, data-src, srcset) ──
    const imgTagRegex = /<img[^>]*>/gi;
    let imgTagMatch: RegExpExecArray | null;
    while ((imgTagMatch = imgTagRegex.exec(html)) !== null) {
      const fullTag = imgTagMatch[0];

      // 소형 이미지 필터
      if (/width=["']?([1-9]|[1-9]\d)["'\s>]/i.test(fullTag) && !/width=["']?[1-9]\d{2,}/i.test(fullTag)) continue;

      // alt 텍스트 추출
      const altMatch = fullTag.match(/alt=["']([^"']*?)["']/i);
      const altText = altMatch?.[1] || "";

      // img 태그 직후 200자 캡션
      const afterTagStart = imgTagMatch.index + fullTag.length;
      const captionSlice = html.slice(afterTagStart, afterTagStart + 300);
      const captionText = captionSlice.replace(/<[^>]+>/g, " ").slice(0, 200);
      const combinedText = `${altText} ${captionText}`;

      // src 속성
      const srcMatch = fullTag.match(/\bsrc=["']([^"']+)["']/i);
      if (srcMatch) {
        const resolved = resolveImageUrl(srcMatch[1], pageUrl);
        if (resolved) addCandidate(resolved, combinedText);
      }

      // data-src 속성 (lazy load)
      const dataSrcMatch = fullTag.match(/data-src=["']([^"']+)["']/i);
      if (dataSrcMatch) {
        const resolved = resolveImageUrl(dataSrcMatch[1], pageUrl);
        if (resolved) addCandidate(resolved, combinedText);
      }

      // srcset 속성 (가장 큰 것)
      const srcsetMatch = fullTag.match(/srcset=["']([^"']+)["']/i);
      if (srcsetMatch) {
        const srcsetEntries = srcsetMatch[1].split(",").map(s => s.trim().split(/\s+/));
        // 가장 큰 width descriptor 또는 마지막 항목
        let bestSrc = "";
        let bestW = 0;
        for (const entry of srcsetEntries) {
          const url = entry[0];
          const descriptor = entry[1] || "";
          const wMatch = descriptor.match(/(\d+)w/);
          const w = wMatch ? parseInt(wMatch[1]) : 0;
          if (w >= bestW) { bestW = w; bestSrc = url; }
        }
        if (bestSrc) {
          const resolved = resolveImageUrl(bestSrc, pageUrl);
          if (resolved) addCandidate(resolved, combinedText);
        }
      }
    }

    // ── 2단계: <source> 태그의 srcset (picture 요소) ──
    const sourceRegex = /<source[^>]*srcset=["']([^"']+)["'][^>]*>/gi;
    let sourceMatch: RegExpExecArray | null;
    while ((sourceMatch = sourceRegex.exec(html)) !== null) {
      const srcsetEntries = sourceMatch[1].split(",").map(s => s.trim().split(/\s+/));
      let bestSrc = "";
      let bestW = 0;
      for (const entry of srcsetEntries) {
        const wMatch = (entry[1] || "").match(/(\d+)w/);
        const w = wMatch ? parseInt(wMatch[1]) : 0;
        if (w >= bestW) { bestW = w; bestSrc = entry[0]; }
      }
      if (bestSrc) {
        const resolved = resolveImageUrl(bestSrc, pageUrl);
        if (resolved) {
          const afterStart = sourceMatch.index + sourceMatch[0].length;
          const ctx = html.slice(afterStart, afterStart + 300).replace(/<[^>]+>/g, " ").slice(0, 200);
          addCandidate(resolved, ctx);
        }
      }
    }

    // ── 3단계: 인라인 URL 패턴 (SPA/SSR JSON 내 이미지 URL) ──
    // <img> 태그가 0개이거나 매칭 이미지가 부족한 경우에만 실행
    if (matched.length === 0) {
      const inlineUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>]*)?)/gi;
      let inlineMatch: RegExpExecArray | null;
      const inlineCandidates: string[] = [];
      while ((inlineMatch = inlineUrlRegex.exec(html)) !== null) {
        let url = inlineMatch[1].replace(/&amp;/g, "&");
        // 작은 크기 표시가 있으면 건너뛰기
        if (/width=([1-9]|[1-9]\d)(?:&|$)/i.test(url)) continue;
        if (/\/icon|\/logo|\/button|\/banner|\/pixel/i.test(url)) continue;
        if (IMAGE_DOMAIN_BLACKLIST.some(domain => url.includes(domain))) continue;
        if (!url.startsWith("https://")) continue;
        if (seenUrls.has(url)) continue;

        // 가장 큰 width 버전 선택 (e.g. width=2560)
        const widthMatch = url.match(/width=(\d+)/);
        const width = widthMatch ? parseInt(widthMatch[1]) : 0;
        // 최소 200px 이상
        if (widthMatch && width < 200) continue;

        inlineCandidates.push(url);
        seenUrls.add(url);
      }

      // 인라인 URL은 주변 컨텍스트 확인이 어렵기 때문에 고해상도(width≥400)만 필터 없이 추가
      // 중복 URL 패턴 그룹핑: 같은 base path의 다양한 width 중 가장 큰 것만 선택
      const basePathMap = new Map<string, { url: string; width: number }>();
      for (const url of inlineCandidates) {
        const basePath = url.replace(/[?&]width=\d+/, "").replace(/[?&]height=\d+/, "");
        const widthMatch = url.match(/width=(\d+)/);
        const w = widthMatch ? parseInt(widthMatch[1]) : 500; // width 없으면 기본값
        const existing = basePathMap.get(basePath);
        if (!existing || w > existing.width) {
          basePathMap.set(basePath, { url, width: w });
        }
      }

      for (const { url } of basePathMap.values()) {
        // 인라인 URL 주변 ±300자 컨텍스트 확인
        const urlIdx = html.indexOf(url.replace(/&/g, "&amp;"));
        const ctx = urlIdx >= 0
          ? html.slice(Math.max(0, urlIdx - 200), urlIdx + url.length + 200).replace(/<[^>]+>/g, " ").slice(0, 400)
          : "";
        addCandidate(url, ctx);
      }

      if (matched.length > 0) {
        console.log(`[cache-image] Inline URL scan found ${matched.length} matches`);
      }
    }

    if (matched.length > 0) {
      console.log(`[cache-image] Name filter: ${matched.length} matched, ${unmatched.length} excluded (methods: img+srcset+data-src+inline)`);
      return matched;
    }

    // 매칭 이미지가 없으면 빈 배열 반환 (무관한 이미지 사용 방지)
    if (hasFilter) {
      console.log(`[cache-image] No name-matched images found, returning empty (${unmatched.length} excluded)`);
      return [];
    }

    return unmatched;
  } catch {
    return [];
  }
}

// ── OpenAI Vision: 텍스트 오버레이 이미지 감지 ──
async function isTextHeavyImage(imageUrl: string, openaiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 20,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: 'Is this a CLEAN photo of a person/scene, or a TEXT-HEAVY image (card news, infographic, banner, chart, text overlay)? Reply ONLY "clean" or "text".' },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        }],
      }),
    });
    if (!res.ok) return false; // API 실패 시 통과
    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const isText = answer.includes("text");
    if (isText) console.log(`[cache-image] Vision: text-heavy image detected → ${imageUrl.slice(0, 80)}`);
    return isText;
  } catch {
    return false; // 에러 시 통과
  }
}

// 후보 이미지 중 가장 큰 클린 이미지를 찾아 반환 (Vision 필터 적용)
async function findLargestImage(
  candidates: string[],
  openaiKey?: string,
): Promise<{ url: string; data: Uint8Array; contentType: string } | null> {
  let best: { url: string; data: Uint8Array; contentType: string } | null = null;
  for (const url of candidates.slice(0, 10)) {
    const result = await downloadImage(url);
    if (!result) continue;
    // 30KB 이상이고 Vision 키가 있으면 텍스트 이미지 여부 검사
    if (openaiKey && result.data.length > LOW_RES_THRESHOLD_BYTES) {
      const isText = await isTextHeavyImage(url, openaiKey);
      if (isText) continue; // 텍스트 이미지 건너뛰기
    }
    if (!best || result.data.length > best.data.length) {
      best = { url, ...result };
    }
    if (result.data.length > 100_000) break;
  }
  return best;
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return map[contentType] || "jpg";
}

// OG 이미지 URL 추출 (source_image_url이 null인 경우 source_url에서 가져오기)
async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // og:image
    const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
    if (ogMatch?.[1]) return sanitizeImageUrl(ogMatch[1]);
    // twitter:image
    const twMatch = html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']twitter:image["']/i);
    if (twMatch?.[1]) return sanitizeImageUrl(twMatch[1]);
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { triggerId, triggerIds, backfill = false, limit = 50, force = false } = body;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    let targets: any[] = [];

    // select에 artist_name, keyword, metadata 추가 (이름 매칭용)
    const selectFields = "id, source_image_url, source_url, star_id, artist_name, keyword, metadata";

    if (triggerId) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select(selectFields)
        .eq("id", triggerId)
        .single();
      if (data) targets = [data];
    } else if (triggerIds?.length) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select(selectFields)
        .in("id", triggerIds);
      if (data) targets = data;
    } else if (backfill) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select(selectFields)
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(limit);

      if (data) {
        targets = data.filter(
          (t: any) => !t.source_image_url || !t.source_image_url.includes(supabaseUrl)
        );
      }
    }

    if (!targets.length) {
      return new Response(
        JSON.stringify({ success: true, cached: 0, message: "No targets to cache" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[cache-image] Processing ${targets.length} triggers`);

    // ── 중복 이미지 방지: 같은 아티스트의 기존 캐시 이미지 수집 ──
    // star_id 별로 이미 캐시된 이미지 원본 URL을 추적
    const artistCachedImages = new Map<string, Set<string>>(); // star_id → Set<source_url>
    const artistCachedImageUrls = new Map<string, Set<string>>(); // star_id → Set<cached image url base>
    const starIds = [...new Set(targets.map((t: any) => t.star_id).filter(Boolean))];
    if (starIds.length > 0) {
      // 같은 아티스트의 다른 트리거 중 이미 캐시된 이미지 URL 조회
      const { data: existingTriggers } = await sb
        .from("ktrenz_trend_triggers")
        .select("star_id, source_image_url, source_url")
        .in("star_id", starIds)
        .eq("status", "active")
        .not("source_image_url", "is", null);
      if (existingTriggers) {
        for (const t of existingTriggers) {
          if (!t.star_id) continue;
          if (!artistCachedImages.has(t.star_id)) artistCachedImages.set(t.star_id, new Set());
          if (!artistCachedImageUrls.has(t.star_id)) artistCachedImageUrls.set(t.star_id, new Set());
          const srcSet = artistCachedImages.get(t.star_id)!;
          const imgUrlSet = artistCachedImageUrls.get(t.star_id)!;
          if (t.source_url) srcSet.add(t.source_url);
          if (t.source_image_url) imgUrlSet.add(t.source_image_url.split("?")[0]);
        }
      }
    }
    // 현재 배치 내에서도 중복 방지를 위한 로컬 트래커
    const batchUsedSourceUrls = new Map<string, Set<string>>(); // star_id → Set<source_url>

    let cached = 0;
    let failed = 0;

    for (const trigger of targets) {
      // 아티스트/키워드 이름 변형 생성 (본문 이미지 필터링용)
      const searchName = trigger.metadata?.search_name || null;
      const groupName = trigger.metadata?.group_name || null;
      const nameVariants = buildNameVariants(trigger.artist_name, searchName);
      // 그룹명과 키워드도 변형에 추가
      const extraVariants = buildNameVariants(groupName, trigger.keyword);
      const allNameVariants = [...new Set([...nameVariants, ...extraVariants])];

      let url = sanitizeImageUrl(trigger.source_image_url);

      // force 모드: 이미 캐시된 이미지도 source_url에서 다시 가져오기
      if (force && url && url.includes(supabaseUrl) && trigger.source_url) {
        console.log(`[cache-image] Force re-cache for ${trigger.id}, fetching OG from ${trigger.source_url}`);
        const ogUrl = await fetchOgImage(trigger.source_url);
        if (ogUrl) {
          url = ogUrl;
        } else {
          console.warn(`[cache-image] Force: no OG image found for ${trigger.id}, skipping`);
          failed++;
          continue;
        }
      }

      // ── 같은 아티스트의 동일 기사 또는 동일 이미지 중복 체크 ──
      const isDuplicateSource = trigger.star_id && trigger.source_url && (() => {
        const existing = artistCachedImages.get(trigger.star_id);
        const batchUsed = batchUsedSourceUrls.get(trigger.star_id);
        return (existing?.has(trigger.source_url) || batchUsed?.has(trigger.source_url));
      })();

      // source_image_url이 null이면 source_url에서 OG 이미지 추출 시도
      if (!url && trigger.source_url) {
        console.log(`[cache-image] No image for ${trigger.id}, fetching OG from ${trigger.source_url}`);
        const ogUrl = await fetchOgImage(trigger.source_url);
        if (ogUrl) {
          url = ogUrl;
          console.log(`[cache-image] Found OG image for ${trigger.id}: ${ogUrl}`);
        } else {
          console.warn(`[cache-image] No OG image found for ${trigger.id}, trying body images`);
        }
      }

      // ── 동일 og:image URL 중복 체크 (다른 기사지만 같은 이미지를 쓰는 경우) ──
      const isImageAlreadyUsed = trigger.star_id && url && (() => {
        const cachedUrls = artistCachedImageUrls.get(trigger.star_id);
        const batchUrls = batchUsedSourceUrls.get(trigger.star_id);
        // 정확한 URL 매치 또는 같은 이미지 경로 패턴
        const urlBase = url!.split("?")[0];
        return cachedUrls?.has(urlBase) || batchUrls?.has(urlBase);
      })();

      // ── 중복 감지 시 본문에서 대체 이미지 시도 ──
      if ((isDuplicateSource || isImageAlreadyUsed) && url && trigger.source_url) {
        const reason = isDuplicateSource ? "duplicate source_url" : "duplicate image URL";
        console.log(`[cache-image] ⚠ ${reason} for star ${trigger.star_id}, trying body images for variety: ${trigger.id}`);
        const candidates = await fetchBodyImageCandidates(trigger.source_url, allNameVariants);
        // 기존 og:image(url)와 다른 이미지만 필터링
        const altCandidates = candidates.filter(c => c !== url);
        if (altCandidates.length > 0) {
          const alt = await findLargestImage(altCandidates, openaiKey);
          if (alt && alt.data.length > LOW_RES_THRESHOLD_BYTES) {
            url = alt.url;
            console.log(`[cache-image] ✓ Found alternative body image for dedup: ${alt.url.slice(0, 80)}`);
          }
        }
        // 대안을 못 찾으면 og:image 유지 (중복이지만 이미지 없는 것보단 나음)
      }
      
      // url이 없으면 본문 이미지 스캔 시도 (아티스트명 필터 적용)
      if (!url && trigger.source_url) {
        console.log(`[cache-image] No OG, trying body images for ${trigger.id} (nameVariants: ${allNameVariants.join(",")})`);
        const candidates = await fetchBodyImageCandidates(trigger.source_url, allNameVariants);
        if (candidates.length > 0) {
          const best = await findLargestImage(candidates, openaiKey);
          if (best && best.data.length > LOW_RES_THRESHOLD_BYTES) {
            url = best.url;
            console.log(`[cache-image] Found body image (${best.data.length}b) for ${trigger.id}: ${best.url}`);
          }
        }
      }

      // 여전히 없으면 아티스트 프로필 이미지로 폴백
      if (!url && trigger.star_id) {
        const { data: starData } = await sb
          .from("ktrenz_stars")
          .select("image_url")
          .eq("id", trigger.star_id)
          .single();
        if (starData?.image_url) {
          url = starData.image_url;
          console.log(`[cache-image] Using artist image for ${trigger.id}: ${url}`);
        }
      }

      if (!url || (!force && url.includes(supabaseUrl))) continue;

      // 블랙리스트 도메인 체크
      const isBlacklisted = IMAGE_DOMAIN_BLACKLIST.some(domain => url!.includes(domain));
      if (isBlacklisted) {
        console.warn(`[cache-image] Skipping blacklisted domain for ${trigger.id}: ${url}`);
        failed++;
        continue;
      }

      const image = await downloadImage(url);
      if (!image) {
        failed++;
        continue;
      }

      // og:image 품질 검사: 저해상도이거나 텍스트 오버레이 이미지면 본문에서 더 나은 이미지를 찾는다
      let finalImage = image;
      let finalUrl = url;
      const isLowRes = image.data.length < LOW_RES_THRESHOLD_BYTES;
      const isTextOverlay = !isLowRes && openaiKey ? await isTextHeavyImage(url!, openaiKey) : false;
      const needsBetterImage = isLowRes || isTextOverlay;
      if (needsBetterImage && trigger.source_url) {
        console.log(`[cache-image] ${isTextOverlay ? 'Text-heavy' : 'Low-res'} og:image (${image.data.length}b) for ${trigger.id}, scanning body images`);
        // 1차: 이름 매칭 본문 이미지
        const candidates = await fetchBodyImageCandidates(trigger.source_url, allNameVariants);
        if (candidates.length > 0) {
          const better = await findLargestImage(candidates, openaiKey);
          if (better && better.data.length > image.data.length * 1.5) {
            console.log(`[cache-image] ✓ Found better name-matched image (${better.data.length}b vs ${image.data.length}b) for ${trigger.id}: ${better.url}`);
            finalImage = better;
            finalUrl = better.url;
          }
        }
        // 2차: 1차에서 개선 못 했으면 필터 없이 본문 최대 이미지 시도
        if (finalImage === image) {
          console.log(`[cache-image] Name-matched images insufficient, trying unfiltered body images for ${trigger.id}`);
          const unfilteredCandidates = await fetchBodyImageCandidates(trigger.source_url, []);
          if (unfilteredCandidates.length > 0) {
            const bestUnfiltered = await findLargestImage(unfilteredCandidates, openaiKey);
            if (bestUnfiltered && bestUnfiltered.data.length > image.data.length * 1.5) {
              console.log(`[cache-image] ✓ Found better unfiltered body image (${bestUnfiltered.data.length}b) for ${trigger.id}: ${bestUnfiltered.url}`);
              finalImage = bestUnfiltered;
              finalUrl = bestUnfiltered.url;
            }
          }
        }
        // 3차: 여전히 개선 못 했으면 아티스트 이미지로 폴백
        if (finalImage === image && trigger.star_id) {
          const { data: starData } = await sb
            .from("ktrenz_stars")
            .select("image_url")
            .eq("id", trigger.star_id)
            .single();
          if (starData?.image_url && !starData.image_url.includes(supabaseUrl)) {
            const artistImg = await downloadImage(starData.image_url);
            if (artistImg && artistImg.data.length > finalImage.data.length) {
              console.log(`[cache-image] Using artist image fallback for ${trigger.id}`);
              finalImage = artistImg;
              finalUrl = starData.image_url;
            }
          }
        }
      }

      const ext = getExtension(finalImage.contentType);
      const storagePath = `${trigger.id}.${ext}`;

      // Upload to storage (upsert)
      const { error: uploadError } = await sb.storage
        .from(BUCKET)
        .upload(storagePath, finalImage.data, {
          contentType: finalImage.contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error(`[cache-image] Upload error for ${trigger.id}:`, uploadError.message);
        failed++;
        continue;
      }

      // Get public URL and append a cache-busting version so browsers don't keep showing stale images
      const { data: publicUrlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
      const cachedUrl = publicUrlData.publicUrl;
      const versionedCachedUrl = `${cachedUrl}?v=${Date.now()}`;

      // Update trigger with cache-busted URL
      await sb
        .from("ktrenz_trend_triggers")
        .update({ source_image_url: versionedCachedUrl } as any)
        .eq("id", trigger.id);

      cached++;
      // 배치 내 중복 추적 업데이트 (source_url + image URL 모두)
      if (trigger.star_id) {
        if (!batchUsedSourceUrls.has(trigger.star_id)) batchUsedSourceUrls.set(trigger.star_id, new Set());
        const batchSet = batchUsedSourceUrls.get(trigger.star_id)!;
        if (trigger.source_url) batchSet.add(trigger.source_url);
        batchSet.add(cachedUrl.split("?")[0]); // 캐시된 이미지 URL도 추적
      }
      console.log(`[cache-image] ✓ ${trigger.id} → ${cachedUrl}`);

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({ success: true, total: targets.length, cached, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[cache-image] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
