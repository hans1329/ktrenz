import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("AB6IX 전웅 dry run - should detect 가수 profession", async () => {
  // 전웅 (Jeon Woong) - AB6IX member
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
  assert(data.results.length === 1, "Should have 1 result");
  
  const result = data.results[0];
  console.log("Result:", JSON.stringify(result, null, 2));
  
  // 전웅은 가수여야 함
  assertEquals(result.mappedQualifier, "가수", `Expected 가수 but got ${result.mappedQualifier}`);
  assert(result.detectedInstagram !== null, "Should detect Instagram handle");
  console.log(`✅ 전웅: profession=${result.detectedProfession}, qualifier=${result.mappedQualifier}, ig=${result.detectedInstagram}`);
});
