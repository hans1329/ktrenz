import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "trend-images";
const BRAND_LOGO_PREFIX = "brand-logos";
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

function normalizeDomain(domain: string | null): string | null {
  if (!domain) return null;
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase() || null;
}

function isPlaceholderLogo(url: string | null | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.includes("logo.clearbit.com") || lower.includes("google.com/s2/favicons") || lower.includes("favicon");
}

function sanitizeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "brand";
}

function getExtension(contentType: string, url?: string | null): string {
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (url?.toLowerCase().endsWith(".svg")) return "svg";
  if (url?.toLowerCase().endsWith(".png")) return "png";
  if (url?.toLowerCase().endsWith(".webp")) return "webp";
  return "jpg";
}

function absolutizeUrl(candidate: string | null | undefined, baseUrl: string): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

async function discoverLogoUrl(domain: string, firecrawlApiKey: string): Promise<string | null> {
  const websiteUrl = `https://${domain}`;
  const response = await fetch(FIRECRAWL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: websiteUrl,
      formats: ["branding", "html"],
      onlyMainContent: false,
      waitFor: 1200,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[ktrenz-brand-logo] Firecrawl error", response.status, payload);
    return null;
  }

  const data = payload?.data ?? payload;
  const branding = data?.branding ?? {};
  const html = data?.html ?? data?.rawHtml ?? "";

  const brandingCandidates = [
    branding?.logo,
    branding?.images?.logo,
    branding?.images?.brandLogo,
    branding?.images?.headerLogo,
  ]
    .map((url: string | null | undefined) => absolutizeUrl(url, websiteUrl))
    .filter(Boolean) as string[];

  if (brandingCandidates.length > 0) return brandingCandidates[0];

  const regexes = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["']/i,
    /<img[^>]+(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/i,
  ];

  for (const regex of regexes) {
    const match = html.match(regex);
    const url = absolutizeUrl(match?.[1], websiteUrl);
    if (url) return url;
  }

  return null;
}

async function downloadImage(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.includes("image") && !contentType.includes("svg")) return null;

    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength < 100) return null;

    return { data, contentType };
  } catch (error) {
    console.error("[ktrenz-brand-logo] downloadImage error", error);
    return null;
  }
}

async function cacheBrandLogo(sb: any, brand: { id: string; brand_name: string; domain: string | null; logo_url: string | null }, logoSourceUrl: string): Promise<string | null> {
  const image = await downloadImage(logoSourceUrl);
  if (!image) return null;

  const ext = getExtension(image.contentType, logoSourceUrl);
  const storagePath = `${BRAND_LOGO_PREFIX}/${brand.id}-${sanitizeFilePart(brand.brand_name)}.${ext}`;

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, image.data, {
    contentType: image.contentType,
    upsert: true,
  });

  if (uploadError) {
    console.error("[ktrenz-brand-logo] upload error", uploadError.message);
    return null;
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await sb
    .from("ktrenz_brand_registry")
    .update({ logo_url: publicUrl })
    .eq("id", brand.id);

  if (updateError) {
    console.error("[ktrenz-brand-logo] update error", updateError.message);
  }

  return publicUrl;
}

async function resolveBrandLogo(sb: any, brand: { id: string; brand_name: string; domain: string | null; logo_url: string | null }, firecrawlApiKey: string | null): Promise<string | null> {
  if (brand.logo_url && !isPlaceholderLogo(brand.logo_url) && brand.logo_url.includes("supabase.co/storage/v1/object/public/")) {
    return brand.logo_url;
  }

  const normalizedDomain = normalizeDomain(brand.domain);
  const candidateUrls = [
    !isPlaceholderLogo(brand.logo_url) ? brand.logo_url : null,
    normalizedDomain && firecrawlApiKey ? await discoverLogoUrl(normalizedDomain, firecrawlApiKey) : null,
    normalizedDomain ? `https://api.companyenrich.com/logo/${normalizedDomain}` : null,
    normalizedDomain ? `https://cdn.tickerlogos.com/${normalizedDomain}` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidateUrls) {
    const cached = await cacheBrandLogo(sb, brand, candidate);
    if (cached) return cached;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { brandIds, limit = 20, onlyMissing = true } = body as { brandIds?: string[]; limit?: number; onlyMissing?: boolean };

      let query = sb
        .from("ktrenz_brand_registry")
        .select("id, brand_name, domain, logo_url")
        .eq("is_active", true)
        .not("domain", "is", null)
        .limit(limit);

      if (brandIds?.length) {
        query = query.in("id", brandIds);
      }

      const { data: brands, error } = await query;
      if (error) throw error;

      const targets = (brands || []).filter((brand: any) => !onlyMissing || isPlaceholderLogo(brand.logo_url));
      const results: Array<{ id: string; brand_name: string; logo_url: string | null }> = [];

      for (const brand of targets) {
        const logoUrl = await resolveBrandLogo(sb, brand, firecrawlApiKey);
        results.push({ id: brand.id, brand_name: brand.brand_name, logo_url: logoUrl });
      }

      return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const directDomain = normalizeDomain(url.searchParams.get("domain"));
    const directBrandName = url.searchParams.get("brandName") || "Brand";
    const directLogoUrl = url.searchParams.get("logoUrl");

    let brand: { id: string; brand_name: string; domain: string | null; logo_url: string | null } | null = null;

    if (brandId) {
      const { data } = await sb
        .from("ktrenz_brand_registry")
        .select("id, brand_name, domain, logo_url")
        .eq("id", brandId)
        .maybeSingle();
      brand = data;
    }

    if (!brand && directDomain) {
      brand = {
        id: `direct-${sanitizeFilePart(directBrandName)}-${sanitizeFilePart(directDomain)}`,
        brand_name: directBrandName,
        domain: directDomain,
        logo_url: directLogoUrl,
      };
    }

    if (!brand) {
      return new Response("Brand not found", { status: 404, headers: corsHeaders });
    }

    const resolvedLogo = await resolveBrandLogo(sb, brand, firecrawlApiKey);
    if (!resolvedLogo) {
      return new Response("Logo not found", { status: 404, headers: corsHeaders });
    }

    return Response.redirect(resolvedLogo, 302);
  } catch (error) {
    console.error("[ktrenz-brand-logo] error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});