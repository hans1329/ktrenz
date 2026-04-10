import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("AB6IX 전웅 - should detect 가수 + all social handles", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ktrenz-fill-naver-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      testStarIds: ["da641ca2-b1f1-43d6-9d3d-a1eb08afd52d"],
      dryRun: true,
    }),
  });

  const body = await response.text();
  console.log("Response:", body);
  
  assertEquals(response.status, 200);
  
  const data = JSON.parse(body);
  assert(data.success, "Should succeed");
  assertEquals(data.mode, "dry_run");
  
  const r = data.results[0];
  console.log("Result:", JSON.stringify(r, null, 2));
  
  // 직업
  assertEquals(r.mappedQualifier, "가수", `Expected 가수 but got ${r.mappedQualifier}`);
  
  // 소셜 핸들 (네이버 인물정보 기준: AB6IX 전웅)
  assert(r.social.instagram !== null, `Instagram should be detected, got: ${r.social.instagram}`);
  assert(r.social.youtube !== null, `YouTube should be detected, got: ${r.social.youtube}`);
  assert(r.social.x !== null, `X/Twitter should be detected, got: ${r.social.x}`);
  
  console.log(`✅ 전웅: 직업=${r.detectedProfession}, IG=${r.social.instagram}, YT=${r.social.youtube}, X=${r.social.x}, TT=${r.social.tiktok}`);
});
