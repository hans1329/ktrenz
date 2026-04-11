import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ghost Admin API JWT helper
function createGhostJwt(apiKey: string): string {
  const [id, secret] = apiKey.split(":");

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iat: now,
    exp: now + 300,
    aud: "/admin/",
  })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const data = `${header}.${payload}`;

  // HMAC-SHA256 signing
  const keyBytes = new Uint8Array(secret.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  return signJwt(data, keyBytes);
}

async function signJwt(data: string, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${sigB64}`;
}

async function publishToGhost(ghostUrl: string, token: string, post: {
  title: string;
  html: string;
  tags?: { name: string }[];
  meta_title?: string;
  meta_description?: string;
  codeinjection_head?: string;
}) {
  const url = `${ghostUrl}/ghost/api/admin/posts/?source=html`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Ghost ${token}`,
    },
    body: JSON.stringify({
      posts: [{
        title: post.title,
        html: post.html,
        status: "published",
        tags: post.tags || [{ name: "Trend Report" }],
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        codeinjection_head: post.codeinjection_head,
      }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Ghost API error ${res.status}: ${errBody}`);
  }

  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ghostUrl = Deno.env.get("GHOST_URL");
    const ghostApiKey = Deno.env.get("GHOST_ADMIN_API_KEY");

    if (!ghostUrl || !ghostApiKey) {
      throw new Error("Missing GHOST_URL or GHOST_ADMIN_API_KEY");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { title, html, tags, meta_title, meta_description, json_ld } = body;

    if (!title || !html) {
      return new Response(JSON.stringify({ error: "title and html are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build JSON-LD code injection
    let codeinjection_head: string | undefined;
    if (json_ld) {
      codeinjection_head = `<script type="application/ld+json">${JSON.stringify(json_ld)}</script>`;
    }

    // Create Ghost JWT token
    const ghostToken = await createGhostJwt(ghostApiKey);

    // Publish
    const result = await publishToGhost(ghostUrl, ghostToken, {
      title,
      html,
      tags: tags?.map((t: string) => ({ name: t })) || [{ name: "Trend Report" }],
      meta_title,
      meta_description,
      codeinjection_head,
    });

    const slug = result.posts?.[0]?.slug;
    const ghostPostUrl = slug ? `${ghostUrl}/${slug}/` : null;

    return new Response(JSON.stringify({
      success: true,
      slug,
      url: ghostPostUrl,
      id: result.posts?.[0]?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Ghost publish error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
