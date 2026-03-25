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

// 본문 HTML에서 고해상도 <img> URL 후보들을 추출 (og:image보다 큰 이미지를 찾기 위해)
async function fetchBodyImageCandidates(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return [];

    // 본문 앞 100KB만 읽기
    const reader = res.body?.getReader();
    if (!reader) return [];
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 100_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const candidates: string[] = [];
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const m of imgMatches) {
      const src = m[1];
      // 광고/아이콘/로고 등 제외
      if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
      if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner|emoticon|emoji/i.test(src)) continue;
      // 작은 크기 힌트가 있는 이미지 제외
      if (/width=["']?([1-9]|[1-9]\d)["'\s>]/i.test(m[0]) && !/width=["']?[1-9]\d{2,}/i.test(m[0])) continue;

      let resolved = src.replace(/&amp;/g, "&");
      if (resolved.startsWith("//")) resolved = "https:" + resolved;
      else if (resolved.startsWith("/")) {
        try { resolved = new URL(resolved, pageUrl).href; } catch { continue; }
      }
      if (!resolved.startsWith("http")) continue;

      // 블랙리스트 도메인 체크
      const isBlacklisted = IMAGE_DOMAIN_BLACKLIST.some(domain => resolved.includes(domain));
      if (isBlacklisted) continue;
      // http:// 프로토콜은 mixed content 위험 → 스킵
      if (resolved.startsWith("http://")) continue;

      candidates.push(resolved);
    }
    return candidates;
  } catch {
    return [];
  }
}

// 후보 이미지 중 가장 큰 것을 찾아 반환
async function findLargestImage(candidates: string[]): Promise<{ url: string; data: Uint8Array; contentType: string } | null> {
  let best: { url: string; data: Uint8Array; contentType: string } | null = null;
  // 최대 6개만 시도 (속도 제한)
  for (const url of candidates.slice(0, 6)) {
    const result = await downloadImage(url);
    if (!result) continue;
    if (!best || result.data.length > best.data.length) {
      best = { url, ...result };
    }
    // 100KB 이상이면 충분히 고해상도 — 즉시 반환
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
    let targets: any[] = [];

    if (triggerId) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("id, source_image_url, source_url, star_id")
        .eq("id", triggerId)
        .single();
      if (data) targets = [data];
    } else if (triggerIds?.length) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("id, source_image_url, source_url, star_id")
        .in("id", triggerIds);
      if (data) targets = data;
    } else if (backfill) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("id, source_image_url, source_url, star_id")
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

    let cached = 0;
    let failed = 0;

    for (const trigger of targets) {
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

      // og:image가 저해상도(30KB 이하)이면 본문에서 더 큰 이미지를 찾는다
      let finalImage = image;
      let finalUrl = url;
      if (image.data.length < LOW_RES_THRESHOLD_BYTES && trigger.source_url) {
        console.log(`[cache-image] Low-res og:image (${image.data.length}b) for ${trigger.id}, scanning body images from ${trigger.source_url}`);
        const candidates = await fetchBodyImageCandidates(trigger.source_url);
        if (candidates.length > 0) {
          const better = await findLargestImage(candidates);
          if (better && better.data.length > image.data.length * 1.5) {
            console.log(`[cache-image] ✓ Found better image (${better.data.length}b vs ${image.data.length}b) for ${trigger.id}: ${better.url}`);
            finalImage = better;
            finalUrl = better.url;
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
