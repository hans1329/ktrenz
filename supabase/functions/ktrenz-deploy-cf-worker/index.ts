import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WORKER_SCRIPT = `
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // /report 경로 → Ghost 서버로 프록시
    if (url.pathname.startsWith('/report')) {
      // Strip /report prefix — Ghost slugs don't include it
      const ghostPath = url.pathname.replace(/^\\/report/, '') || '/';

      // Ghost expects trailing slash on post slugs — redirect if missing
      // (skip for files with extensions like .css, .js, .png, etc.)
      if (ghostPath !== '/' && !ghostPath.endsWith('/') && !ghostPath.match(/\\.[a-z0-9]{2,5}$/i)) {
        return Response.redirect(url.origin + '/report' + ghostPath + '/' + url.search, 301);
      }

      const ghostUrl = 'http://ghost.ktrenz.com' + ghostPath + url.search;

      const ghostHeaders = new Headers({
        'Host': 'ghost.ktrenz.com',
        'X-Forwarded-Host': 'ktrenz.com',
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Forwarded-Proto': 'https',
        'Accept': request.headers.get('Accept') || '*/*',
        'Accept-Encoding': request.headers.get('Accept-Encoding') || '',
      });

      const response = await fetch(ghostUrl, {
        method: request.method,
        headers: ghostHeaders,
        redirect: 'manual',
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      // Handle Ghost redirects — rewrite Location to /report/...
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location') || '';
        let newLocation = location;
        // Rewrite ghost.ktrenz.com URLs
        newLocation = newLocation.replace(/https?:\\/\\/ghost\\.ktrenz\\.com\\//g, url.origin + '/report/');
        // Rewrite bare domain redirects from Ghost
        newLocation = newLocation.replace(/^\\/((?!report)[^/])/, '/report/$1');
        return Response.redirect(newLocation, response.status);
      }

      const contentType = response.headers.get('Content-Type') || '';
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Robots-Tag', 'index, follow');
      newHeaders.delete('X-Frame-Options');

      // For HTML responses, rewrite asset URLs to include /report prefix
      if (contentType.includes('text/html')) {
        let html = await response.text();
        // Rewrite absolute paths for Ghost assets to /report/...
        html = html.replace(/(href|src|content)="\\/(assets|public|content|ghost|favicon|shared|members)\\//g, '$1="/report/$2/');
        // Rewrite srcset paths
        html = html.replace(/srcset="\\/(content)\\//g, 'srcset="/report/$1/');
        // Rewrite url() in inline styles  
        html = html.replace(/url\\(\\/(assets|content|public)\\//g, 'url(/report/$1/');
        // Rewrite canonical and other meta URLs that point to ghost.ktrenz.com or the raw domain
        html = html.replace(/https?:\\/\\/ghost\\.ktrenz\\.com\\//g, 'https://ktrenz.com/report/');
        // Fix internal Ghost links (e.g. href="/some-slug/") to point to /report/some-slug/
        // Only for <a> tags with relative paths that look like Ghost post slugs
        html = html.replace(/href="\\/((?!report\\/|assets\\/|public\\/|content\\/|ghost\\/|favicon|shared\\/|members\\/)[a-z0-9][a-z0-9-]*\\/?)"/g, 'href="/report/$1"');
        return new Response(html, {
          status: response.status,
          headers: newHeaders,
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // 그 외 → Lovable 앱으로 프록시
    const lovableUrl = 'https://ktrenz.lovable.app' + url.pathname + url.search;
    const response = await fetch(lovableUrl, {
      method: request.method,
      headers: new Headers({
        'Host': 'ktrenz.lovable.app',
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Forwarded-Proto': 'https',
      }),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }
};
`;

async function deployWorker(accountId: string, apiToken: string, workerName: string) {
  // Upload worker script
  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;

  const formData = new FormData();
  formData.append(
    "worker.js",
    new Blob([WORKER_SCRIPT], { type: "application/javascript+module" }),
    "worker.js"
  );
  formData.append(
    "metadata",
    new Blob([JSON.stringify({
      main_module: "worker.js",
      compatibility_date: "2024-01-01",
    })], { type: "application/json" })
  );

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiToken}` },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Worker upload failed ${res.status}: ${errBody}`);
  }

  return await res.json();
}

async function ensureGhostDnsRecord(zoneId: string, apiToken: string) {
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=ghost.ktrenz.com`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
  });
  const listData = await listRes.json();

  if (listData.result?.length > 0) {
    console.log("Ghost DNS record already exists");
    return listData.result[0];
  }

  // Create DNS-only (not proxied) A record
  const createRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "A",
      name: "ghost",
      content: "168.144.100.36",
      proxied: false,
      ttl: 1,
    }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`DNS record create failed ${createRes.status}: ${errBody}`);
  }
  console.log("Ghost DNS record created");
  return await createRes.json();
}

async function setWorkerRoute(zoneId: string, apiToken: string, workerName: string) {
  // List existing routes first
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
  });
  const listData = await listRes.json();

  const pattern = "ktrenz.com/*";
  const existing = listData.result?.find((r: any) => r.pattern === pattern);

  if (existing) {
    // Update existing route
    const updateUrl = `${listUrl}/${existing.id}`;
    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, script: workerName }),
    });
    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      throw new Error(`Route update failed ${updateRes.status}: ${errBody}`);
    }
    return await updateRes.json();
  }

  // Create new route
  const createRes = await fetch(listUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pattern, script: workerName }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Route create failed ${createRes.status}: ${errBody}`);
  }
  return await createRes.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const zoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");

    if (!accountId || !apiToken || !zoneId) {
      throw new Error("Missing Cloudflare credentials");
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
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workerName = "ktrenz-report-proxy";

    // Step 0: ghost.ktrenz.com DNS record must exist (created manually)
    // DNS API token lacks permissions, so skip auto-creation
    console.log("Assuming ghost.ktrenz.com DNS record exists...");

    // Step 1: Deploy worker script
    console.log("Deploying worker script...");
    const deployResult = await deployWorker(accountId, apiToken, workerName);
    console.log("Worker deployed:", JSON.stringify(deployResult));

    // Step 2: Set route
    console.log("Setting worker route...");
    const routeResult = await setWorkerRoute(zoneId, apiToken, workerName);
    console.log("Route set:", JSON.stringify(routeResult));

    return new Response(JSON.stringify({
      success: true,
      worker: workerName,
      route: "ktrenz.com/*",
      deploy: deployResult,
      routeConfig: routeResult,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("CF Worker deploy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
