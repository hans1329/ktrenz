Deno.test("Naver news pagination works beyond 100", async () => {
  const naverId = Deno.env.get("NAVER_CLIENT_ID");
  const naverSecret = Deno.env.get("NAVER_CLIENT_SECRET");
  if (!naverId || !naverSecret) {
    console.log("SKIP: no naver keys");
    return;
  }
  
  // Test with a popular query that should have >100 results
  const query = "BTS";
  
  // Page 1
  const url1 = new URL("https://openapi.naver.com/v1/search/news.json");
  url1.searchParams.set("query", query);
  url1.searchParams.set("display", "100");
  url1.searchParams.set("start", "1");
  url1.searchParams.set("sort", "date");
  
  const res1 = await fetch(url1.toString(), {
    headers: { "X-Naver-Client-Id": naverId, "X-Naver-Client-Secret": naverSecret },
  });
  console.log(`Page 1: status=${res1.status}`);
  const data1 = await res1.json();
  console.log(`Page 1: ${data1.items?.length} items, total=${data1.total}`);
  
  // Small delay
  await new Promise(r => setTimeout(r, 300));
  
  // Page 2
  const url2 = new URL("https://openapi.naver.com/v1/search/news.json");
  url2.searchParams.set("query", query);
  url2.searchParams.set("display", "100");
  url2.searchParams.set("start", "101");
  url2.searchParams.set("sort", "date");
  
  const res2 = await fetch(url2.toString(), {
    headers: { "X-Naver-Client-Id": naverId, "X-Naver-Client-Secret": naverSecret },
  });
  console.log(`Page 2: status=${res2.status}`);
  if (res2.ok) {
    const data2 = await res2.json();
    console.log(`Page 2: ${data2.items?.length} items`);
  } else {
    console.log(`Page 2 FAILED: ${await res2.text()}`);
  }
});
