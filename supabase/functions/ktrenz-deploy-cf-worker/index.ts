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
      const ghostUrl = 'http://ghost.ktrenz.com' + ghostPath + url.search;
      const response = await fetch(ghostUrl, {
        method: request.method,
        headers: new Headers({
          'Host': 'ghost.ktrenz.com',
          'X-Forwarded-Host': 'ktrenz.com',
          'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
          'X-Forwarded-Proto': 'https',
        }),
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Robots-Tag', 'index, follow');
      newHeaders.delete('X-Frame-Options');

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
