// 아티스트 프로필 이미지 자동 크롤링 (SerpAPI Google Image Search)
// wiki_entry_id가 없거나 image_url이 없는 ktrenz_stars에 대해 이미지를 검색하여 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "trend-images";

async function searchArtistImage(
  artistName: string,
  nameKo: string | null,
  groupName: string | null,
  serpApiKey: string
): Promise<string | null> {
  // Build search query: "아티스트명 kpop" or "멤버명 그룹명 kpop"
  const query = groupName
    ? `${nameKo || artistName} ${groupName} kpop idol`
    : `${nameKo || artistName} kpop idol`;

  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    api_key: serpApiKey,
    num: "5",
    safe: "active",
    ijn: "0",
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`https://serpapi.com/search?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[fill-star-images] SerpAPI error ${res.status} for "${query}"`);
      return null;
    }

    const data = await res.json();
    const images = data.images_results || [];

    // Filter for reasonable profile images
    for (const img of images) {
      const url: string = img.original || img.thumbnail;
      if (!url) continue;

      // Skip known problematic domains
      if (
        url.includes("fbcdn.net") ||
        url.includes("instagram.com") ||
        url.includes("tiktok.com") ||
        url.includes("pinterest.com")
      ) continue;

      // Prefer images from known K-pop sources
      const width = img.original_width || 0;
      const height = img.original_height || 0;

      // Skip tiny images or extremely wide banners
      if (width > 0 && height > 0) {
        const ratio = width / height;
        if (width < 100 || height < 100) continue;
        if (ratio > 3 || ratio < 0.2) continue; // skip banners
      }

      return url;
    }

    return null;
  } catch (e) {
    console.error(`[fill-star-images] Search error for "${query}":`, (e as Error).message);
    return null;
  }
}

async function downloadAndCache(
  sb: any,
  starId: string,
  imageUrl: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length < 1000) return null; // too small, likely placeholder

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[contentType] || "jpg";
    const storagePath = `stars/${starId}.${ext}`;

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, data, { contentType, upsert: true });

    if (uploadError) {
      console.error(`[fill-star-images] Upload error for ${starId}:`, uploadError.message);
      return null;
    }

    const { data: publicUrlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    return publicUrlData.publicUrl;
  } catch (e) {
    console.error(`[fill-star-images] Download error:`, (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { limit = 5, starId } = body;

    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ error: "SERPAPI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let targets: any[] = [];

    if (starId) {
      const { data } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, star_type, group_star_id, image_url")
        .eq("id", starId)
        .single();
      if (data && !data.image_url) targets = [data];
    } else {
      // Directly fetch stars with no image_url AND no wiki_entry_id (these are the real targets)
      const { data } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, star_type, group_star_id, image_url")
        .eq("is_active", true)
        .is("image_url", null)
        .is("wiki_entry_id", null)
        .order("display_name")
        .limit(limit);

      if (data) targets = data;
    }

    if (!targets.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No targets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve group names for members
    const groupIds = [...new Set(targets.filter((t: any) => t.group_star_id).map((t: any) => t.group_star_id))];
    let groupNameMap = new Map<string, string>();
    if (groupIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name")
        .in("id", groupIds);
      if (groups) {
        groupNameMap = new Map(groups.map((g: any) => [g.id, g.display_name]));
      }
    }

    console.log(`[fill-star-images] Processing ${targets.length} stars (offset=${offset})`);

    let filled = 0;
    let failed = 0;

    for (const star of targets) {
      const groupName = star.group_star_id ? groupNameMap.get(star.group_star_id) || null : null;

      const imageUrl = await searchArtistImage(
        star.display_name,
        star.name_ko,
        groupName,
        serpApiKey
      );

      if (!imageUrl) {
        console.warn(`[fill-star-images] No image found for ${star.display_name}`);
        // Mark as attempted to avoid re-processing (store empty string)
        await sb
          .from("ktrenz_stars")
          .update({ image_url: "" } as any)
          .eq("id", star.id);
        failed++;
        continue;
      }

      // Download and cache in Storage
      const cachedUrl = await downloadAndCache(sb, star.id, imageUrl);

      if (cachedUrl) {
        await sb
          .from("ktrenz_stars")
          .update({ image_url: cachedUrl } as any)
          .eq("id", star.id);
        filled++;
        console.log(`[fill-star-images] ✓ ${star.display_name} → ${cachedUrl}`);
      } else {
        // Store original URL as fallback
        await sb
          .from("ktrenz_stars")
          .update({ image_url: imageUrl } as any)
          .eq("id", star.id);
        filled++;
        console.log(`[fill-star-images] ✓ ${star.display_name} → ${imageUrl} (direct)`);
      }

      // Rate limit: SerpAPI allows 100 searches/min on paid plan
      await new Promise((r) => setTimeout(r, 800));
    }

    // Auto-chain if more targets remain
    const nextOffset = offset + limit;
    let chained = false;

    if (!starId && targets.length === limit) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        await fetch(`${supabaseUrl}/functions/v1/fill-star-images`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ limit, offset: nextOffset }),
        });
        chained = true;
        console.log(`[fill-star-images] Chained next batch offset=${nextOffset}`);
      } catch (e) {
        console.error(`[fill-star-images] Chain error:`, (e as Error).message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: targets.length,
        filled,
        failed,
        nextOffset: chained ? nextOffset : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fill-star-images] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
