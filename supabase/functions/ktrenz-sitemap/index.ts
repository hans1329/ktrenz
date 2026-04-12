const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ghost Admin API JWT helper
async function createGhostJwt(apiKey: string): Promise<string> {
  const [id, secret] = apiKey.split(":");
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = `${header}.${payload}`;
  const keyBytes = new Uint8Array(secret.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${sigB64}`;
}

const SITE_URL = "https://ktrenz.com";

const staticRoutes = [
  { loc: "/", changefreq: "hourly", priority: "1.0", hreflang: true },
  { loc: "/rankings", changefreq: "hourly", priority: "0.9" },
  { loc: "/discover", changefreq: "hourly", priority: "0.8" },
  { loc: "/battle", changefreq: "hourly", priority: "0.8" },
  { loc: "/fes-engine", changefreq: "weekly", priority: "0.7" },
  { loc: "/about", changefreq: "monthly", priority: "0.7", hreflang: true },
  { loc: "/agent", changefreq: "weekly", priority: "0.6" },
  { loc: "/signal", changefreq: "weekly", priority: "0.6" },
  { loc: "/k-pass", changefreq: "monthly", priority: "0.5" },
  { loc: "/trend-map", changefreq: "hourly", priority: "0.8" },
  { loc: "/trend-grades", changefreq: "daily", priority: "0.7" },
];

interface UrlEntry {
  loc: string;
  changefreq: string;
  priority: string;
  lastmod?: string;
  hreflangLinks?: { lang: string; href: string }[];
}

function buildUrlEntry(route: UrlEntry): string {
  const url = `${SITE_URL}${route.loc}`;
  let entry = `  <url>\n    <loc>${url}</loc>\n`;
  if (route.lastmod) entry += `    <lastmod>${route.lastmod}</lastmod>\n`;
  entry += `    <changefreq>${route.changefreq}</changefreq>\n`;
  entry += `    <priority>${route.priority}</priority>\n`;
  if (route.hreflangLinks) {
    for (const link of route.hreflangLinks) {
      entry += `    <xhtml:link rel="alternate" hreflang="${link.lang}" href="${link.href}" />\n`;
    }
  }
  entry += `  </url>`;
  return entry;
}

// Default hreflang for app pages (same URL for all langs since app handles i18n client-side)
function defaultHreflang(loc: string): { lang: string; href: string }[] {
  const url = `${SITE_URL}${loc}`;
  return [
    { lang: "en", href: url },
    { lang: "ko", href: url },
    { lang: "ja", href: url },
    { lang: "x-default", href: url },
  ];
}

// Build hreflang pairs for Ghost posts (ko ↔ en cross-reference)
function buildReportHreflang(
  slug: string,
  allSlugs: string[]
): { lang: string; href: string }[] | undefined {
  const isKo = slug.endsWith("-ko");
  const isEn = slug.endsWith("-en");
  if (!isKo && !isEn) return undefined;

  const baseSlug = slug.replace(/-(ko|en)$/, "");
  const koSlug = `${baseSlug}-ko`;
  const enSlug = `${baseSlug}-en`;
  const hasKo = allSlugs.includes(koSlug);
  const hasEn = allSlugs.includes(enSlug);

  const links: { lang: string; href: string }[] = [];
  if (hasKo) links.push({ lang: "ko", href: `${SITE_URL}/report/${koSlug}/` });
  if (hasEn) links.push({ lang: "en", href: `${SITE_URL}/report/${enSlug}/` });
  if (hasEn) links.push({ lang: "x-default", href: `${SITE_URL}/report/${enSlug}/` });

  return links.length > 1 ? links : undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ghostUrl = Deno.env.get("GHOST_URL")?.replace(/\/ghost\/?$/, "");
    const ghostApiKey = Deno.env.get("GHOST_ADMIN_API_KEY");

    // Build static entries
    const entries: string[] = staticRoutes.map((r) =>
      buildUrlEntry({
        ...r,
        hreflangLinks: r.hreflang ? defaultHreflang(r.loc) : undefined,
      })
    );

    // Fetch Ghost posts for /report/* entries
    if (ghostUrl && ghostApiKey) {
      try {
        const token = await createGhostJwt(ghostApiKey);
        const apiUrl = `${ghostUrl}/ghost/api/admin/posts/?limit=all&fields=slug,updated_at,published_at&filter=status:published&order=published_at desc`;
        const res = await fetch(apiUrl, {
          headers: { Authorization: `Ghost ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const posts: { slug: string; updated_at?: string; published_at?: string }[] = data.posts || [];
          const allSlugs = posts.map((p) => p.slug);

          for (const post of posts) {
            const lastmod = (post.updated_at || post.published_at || "").split("T")[0];
            entries.push(
              buildUrlEntry({
                loc: `/report/${post.slug}/`,
                changefreq: "weekly",
                priority: "0.6",
                lastmod,
                hreflangLinks: buildReportHreflang(post.slug, allSlugs),
              })
            );
          }
        } else {
          console.error("Ghost API error:", res.status, await res.text());
        }
      } catch (e) {
        console.error("Failed to fetch Ghost posts:", e);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
