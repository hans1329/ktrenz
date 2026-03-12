import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_PLATFORMS = [
  "youtube", "youtube_music", "buzz_multi", "hanteo_daily",
  "lastfm", "deezer", "naver_news", "yt_sentiment",
];

const REQUIRED_GEO_SOURCES = ["google_trends", "lastfm"];

interface Issue {
  wiki_entry_id: string;
  artist_name: string;
  issue_type: string;
  platform: string | null;
  severity: string;
  title: string;
  description: string;
  expected_value: string | null;
  actual_value: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let targetWikiEntryId: string | null = null;
    let verifyIds = true;
    try {
      const body = await req.json();
      targetWikiEntryId = body?.wiki_entry_id ?? null;
      verifyIds = body?.verify_ids !== false;
    } catch {
      verifyIds = false;
    }

    // Get artists
    let query = supabase
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, tier, youtube_channel_id, lastfm_artist_name, deezer_artist_id");

    if (targetWikiEntryId) {
      query = query.eq("wiki_entry_id", targetWikiEntryId);
    } else {
      query = query.eq("tier", 1);
    }

    const { data: artists } = await query;
    if (!artists || artists.length === 0) {
      return new Response(
        JSON.stringify({ message: targetWikiEntryId ? "Artist not found" : "No Tier 1 artists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wikiIds = artists.map(a => a.wiki_entry_id);
    const issues: Issue[] = [];
    const now = new Date();
    const staleMs = 26 * 60 * 60 * 1000;

    // ── Bulk fetch: latest 2 snapshots per artist per platform ──
    // Use a single query with RPC or multiple parallel queries by platform
    const snapshotsByArtistPlatform = new Map<string, any[]>();

    // Fetch all recent snapshots for these artists in bulk (last 48h to cover staleness)
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: allSnapshots } = await supabase
      .from("ktrenz_data_snapshots")
      .select("wiki_entry_id, platform, collected_at, metrics")
      .in("wiki_entry_id", wikiIds)
      .in("platform", REQUIRED_PLATFORMS)
      .gte("collected_at", cutoff48h)
      .order("collected_at", { ascending: false })
      .limit(1000);

    // Also check if any platform has EVER had data (for missing_source detection)
    const { data: everCollected } = await supabase
      .from("ktrenz_data_snapshots")
      .select("wiki_entry_id, platform")
      .in("wiki_entry_id", wikiIds)
      .in("platform", REQUIRED_PLATFORMS)
      .limit(1000);

    const everCollectedSet = new Set(
      (everCollected || []).map(s => `${s.wiki_entry_id}|${s.platform}`)
    );

    // Group snapshots
    for (const snap of (allSnapshots || [])) {
      const key = `${snap.wiki_entry_id}|${snap.platform}`;
      if (!snapshotsByArtistPlatform.has(key)) {
        snapshotsByArtistPlatform.set(key, []);
      }
      const arr = snapshotsByArtistPlatform.get(key)!;
      if (arr.length < 2) arr.push(snap); // keep top 2
    }

    // ── Bulk fetch: scores ──
    const { data: allScores } = await supabase
      .from("v3_scores_v2")
      .select("wiki_entry_id, youtube_score, music_score, buzz_score, social_score")
      .in("wiki_entry_id", wikiIds);

    const scoresMap = new Map<string, any>();
    for (const s of (allScores || [])) {
      scoresMap.set(s.wiki_entry_id, s);
    }

    // ── Bulk fetch: geo data counts ──
    const { data: geoData } = await supabase
      .from("ktrenz_geo_fan_data")
      .select("wiki_entry_id, source")
      .in("wiki_entry_id", wikiIds)
      .in("source", REQUIRED_GEO_SOURCES)
      .limit(1000);

    const geoSet = new Set(
      (geoData || []).map(g => `${g.wiki_entry_id}|${g.source}`)
    );

    // ── Process each artist ──
    for (const artist of artists) {
      const wikiId = artist.wiki_entry_id;
      const name = artist.display_name;

      // Check 1-4: Platform snapshots
      for (const platform of REQUIRED_PLATFORMS) {
        const key = `${wikiId}|${platform}`;
        const snapshots = snapshotsByArtistPlatform.get(key);
        const hasEver = everCollectedSet.has(key);

        if (!hasEver && (!snapshots || snapshots.length === 0)) {
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "missing_source", platform, severity: "critical",
            title: `${name}: ${platform} 데이터 없음`,
            description: `${platform} 플랫폼에서 수집된 스냅샷이 0건입니다.`,
            expected_value: "1건 이상", actual_value: "0건",
          });
          continue;
        }

        if (!snapshots || snapshots.length === 0) {
          // Has historical data but nothing in last 48h
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "stale_data", platform, severity: "high",
            title: `${name}: ${platform} 수집 지연 (>48h)`,
            description: `마지막 수집이 48시간 이상 전입니다.`,
            expected_value: "≤26h", actual_value: ">48h",
          });
          continue;
        }

        const latest = snapshots[0];
        const latestTime = new Date(latest.collected_at).getTime();
        if (now.getTime() - latestTime > staleMs) {
          const hoursAgo = Math.round((now.getTime() - latestTime) / (1000 * 60 * 60));
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "stale_data", platform,
            severity: hoursAgo > 48 ? "high" : "medium",
            title: `${name}: ${platform} 수집 지연 (${hoursAgo}h)`,
            description: `마지막 수집이 ${hoursAgo}시간 전입니다. 정상 주기는 6시간입니다.`,
            expected_value: "≤26h", actual_value: `${hoursAgo}h`,
          });
        }

        // Zero metrics check
        if (latest?.metrics) {
          const metrics = latest.metrics as Record<string, unknown>;
          const majorFields: Record<string, string[]> = {
            youtube: ["viewCount", "subscriberCount"],
            youtube_music: ["viewCount"],
            lastfm: ["playcount", "listeners"],
            deezer: ["fans"],
            buzz_multi: ["total_score"],
          };
          for (const field of (majorFields[platform] || [])) {
            const val = metrics[field];
            if (val === 0 || val === null || val === undefined) {
              issues.push({
                wiki_entry_id: wikiId, artist_name: name,
                issue_type: "zero_score", platform, severity: "high",
                title: `${name}: ${platform}.${field} = 0`,
                description: `Tier 1 아티스트의 ${field} 값이 0 또는 null입니다.`,
                expected_value: "> 0", actual_value: String(val ?? "null"),
              });
            }
          }
        }
      }

      // Check 5: Score anomalies
      const scores = scoresMap.get(wikiId);
      if (scores) {
        for (const sf of [
          { key: "youtube_score", label: "YouTube Score" },
          { key: "music_score", label: "Music Score" },
          { key: "buzz_score", label: "Buzz Score" },
          { key: "social_score", label: "Social Score" },
        ]) {
          const val = scores[sf.key];
          if (val === 0 || val === null) {
            issues.push({
              wiki_entry_id: wikiId, artist_name: name,
              issue_type: "zero_score", platform: sf.key, severity: "high",
              title: `${name}: ${sf.label} = 0`,
              description: `Tier 1 아티스트의 ${sf.label}이 0입니다.`,
              expected_value: "> 0", actual_value: String(val ?? "null"),
            });
          }
        }
      }

      // Check 6: Missing identifiers
      const requiredIds: { key: keyof typeof artist; label: string }[] = [
        { key: "youtube_channel_id", label: "YouTube Channel ID" },
        { key: "lastfm_artist_name", label: "Last.fm Name" },
        { key: "deezer_artist_id", label: "Deezer ID" },
      ];
      for (const rid of requiredIds) {
        const val = artist[rid.key];
        if (!val || val === "" || val === "null") {
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "missing_source", platform: rid.key as string, severity: "high",
            title: `${name}: ${rid.label} 미설정`,
            description: `${rid.label}가 없어 해당 플랫폼 수집이 불가능합니다.`,
            expected_value: "설정됨", actual_value: "없음",
          });
        }
      }

      // Check 6b: Verify Deezer ID (only when verify_ids=true)
      if (verifyIds && artist.deezer_artist_id && artist.deezer_artist_id !== "" && artist.deezer_artist_id !== "null") {
        try {
          const deezerResp = await fetch(`https://api.deezer.com/artist/${artist.deezer_artist_id}`);
          const deezerData = await deezerResp.json();
          if (deezerData && !deezerData.error) {
            const deezerName = (deezerData.name || "").toLowerCase();
            const expectedName = name.toLowerCase();
            const match = deezerName.includes(expectedName) || expectedName.includes(deezerName)
              || deezerName.replace(/\s/g, "") === expectedName.replace(/\s/g, "");
            if (!match) {
              const fans = deezerData.nb_fan || 0;
              issues.push({
                wiki_entry_id: wikiId, artist_name: name,
                issue_type: "wrong_identifier", platform: "deezer_artist_id", severity: "critical",
                title: `${name}: Deezer ID가 다른 아티스트를 가리킴`,
                description: `저장된 Deezer ID ${artist.deezer_artist_id}의 실제 아티스트: "${deezerData.name}" (fans: ${fans.toLocaleString()}). 예상: "${name}"`,
                expected_value: name,
                actual_value: `${deezerData.name} (ID: ${artist.deezer_artist_id}, fans: ${fans.toLocaleString()})`,
              });
              console.log(`[Auditor] ⚠️ Deezer mismatch: ${name} → ID ${artist.deezer_artist_id} = "${deezerData.name}" (${fans} fans)`);
              // Suggest correct ID
              try {
                const searchResp = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`);
                const searchData = await searchResp.json();
                if (searchData?.data?.[0]) {
                  const best = searchData.data[0];
                  console.log(`[Auditor] 💡 Suggested: ${best.id} ("${best.name}", ${best.nb_fan} fans)`);
                }
              } catch { /* ignore */ }
            }
          }
        } catch (e) {
          console.warn(`[Auditor] Deezer verify failed for ${name}: ${(e as Error).message}`);
        }
      }

      // Check 6c: Verify Last.fm name (only when verify_ids=true)
      if (verifyIds && artist.lastfm_artist_name && artist.lastfm_artist_name !== "") {
        try {
          const LASTFM_KEY = Deno.env.get("LASTFM_API_KEY");
          if (LASTFM_KEY) {
            const lfmResp = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist.lastfm_artist_name)}&api_key=${LASTFM_KEY}&format=json`);
            const lfmData = await lfmResp.json();
            if (lfmData?.error) {
              issues.push({
                wiki_entry_id: wikiId, artist_name: name,
                issue_type: "wrong_identifier", platform: "lastfm_artist_name", severity: "high",
                title: `${name}: Last.fm 이름 조회 실패`,
                description: `"${artist.lastfm_artist_name}" → Last.fm 에러: ${lfmData.message}`,
                expected_value: "유효한 아티스트", actual_value: `Error: ${lfmData.message}`,
              });
            } else if (lfmData?.artist) {
              const listeners = parseInt(lfmData.artist.stats?.listeners || "0");
              if (listeners < 1000) {
                issues.push({
                  wiki_entry_id: wikiId, artist_name: name,
                  issue_type: "wrong_identifier", platform: "lastfm_artist_name", severity: "high",
                  title: `${name}: Last.fm 리스너 비정상 (${listeners})`,
                  description: `"${artist.lastfm_artist_name}"의 리스너가 ${listeners}명. 동명이인 가능성.`,
                  expected_value: "> 10,000", actual_value: `${listeners.toLocaleString()} listeners`,
                });
              }
            }
          }
        } catch (e) {
          console.warn(`[Auditor] Last.fm verify failed for ${name}: ${(e as Error).message}`);
        }
      }

      // Check 7: Geo data coverage
      for (const geoSource of REQUIRED_GEO_SOURCES) {
        if (!geoSet.has(`${wikiId}|${geoSource}`)) {
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "missing_source", platform: `geo_${geoSource}`, severity: "medium",
            title: `${name}: Geo(${geoSource}) 데이터 없음`,
            description: `${geoSource} 소스의 지리 데이터가 없습니다.`,
            expected_value: "1건 이상", actual_value: "0건",
          });
        }
      }
    }

    // ── Upsert issues ──
    let inserted = 0;
    let skipped = 0;
    for (const issue of issues) {
      const { error } = await supabase
        .from("ktrenz_data_quality_issues")
        .upsert({
          wiki_entry_id: issue.wiki_entry_id,
          artist_name: issue.artist_name,
          issue_type: issue.issue_type,
          platform: issue.platform,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          expected_value: issue.expected_value,
          actual_value: issue.actual_value,
          resolved: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "wiki_entry_id,issue_type,platform",
          ignoreDuplicates: false,
        });
      if (error) skipped++;
      else inserted++;
    }

    // ── Auto-resolve cleared issues ──
    let autoResolved = 0;
    if (!targetWikiEntryId) {
      // Only auto-resolve when running full audit
      const { data: openIssues } = await supabase
        .from("ktrenz_data_quality_issues")
        .select("id, wiki_entry_id, issue_type, platform")
        .eq("resolved", false);

      if (openIssues) {
        const issueKeys = new Set(issues.map(i => `${i.wiki_entry_id}|${i.issue_type}|${i.platform}`));
        const toResolve = openIssues.filter(o => !issueKeys.has(`${o.wiki_entry_id}|${o.issue_type}|${o.platform}`));
        for (const r of toResolve) {
          await supabase
            .from("ktrenz_data_quality_issues")
            .update({ resolved: true, resolved_at: new Date().toISOString(), resolution_note: "자동 해결" })
            .eq("id", r.id);
          autoResolved++;
        }
      }
    }

    const summary = {
      artists_checked: artists.length,
      issues_found: issues.length,
      inserted, skipped, auto_resolved: autoResolved,
      verify_ids: verifyIds,
      by_severity: {
        critical: issues.filter(i => i.severity === "critical").length,
        high: issues.filter(i => i.severity === "high").length,
        medium: issues.filter(i => i.severity === "medium").length,
        low: issues.filter(i => i.severity === "low").length,
      },
    };

    console.log(`[Auditor] Done: ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[Auditor] Error: ${(err as Error).message}`);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
