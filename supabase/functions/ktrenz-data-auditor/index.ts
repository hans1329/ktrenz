import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Required platforms for Tier 1 artists
const REQUIRED_PLATFORMS = [
  "youtube",
  "youtube_music",
  "buzz_multi",
  "hanteo_daily",
  "lastfm",
  "deezer",
  "naver_news",
  "yt_sentiment",
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

    // Parse optional wiki_entry_id and verify_ids flag
    let targetWikiEntryId: string | null = null;
    let verifyIds = true; // verify Deezer/Last.fm IDs via external API
    try {
      const body = await req.json();
      targetWikiEntryId = body?.wiki_entry_id ?? null;
      verifyIds = body?.verify_ids !== false; // default true, set false to skip
    } catch {
      // No body or invalid JSON — audit all, skip ID verification for speed
      verifyIds = false;
    }

    // Get artists to audit from v3_artist_tiers
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
        JSON.stringify({ message: targetWikiEntryId ? "Artist not found" : "No Tier 1 artists found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const issues: Issue[] = [];
    const now = new Date();
    const staleThresholdMs = 26 * 60 * 60 * 1000; // 26 hours

    for (const artist of artists) {
      const wikiId = artist.wiki_entry_id;
      const name = artist.display_name;

      // ── Check 1: Missing platform snapshots ──
      for (const platform of REQUIRED_PLATFORMS) {
        const { data: snapshots, count } = await supabase
          .from("ktrenz_data_snapshots")
          .select("collected_at, metrics", { count: "exact" })
          .eq("wiki_entry_id", wikiId)
          .eq("platform", platform)
          .order("collected_at", { ascending: false })
          .limit(2);

        if (!count || count === 0) {
          issues.push({
            wiki_entry_id: wikiId,
            artist_name: name,
            issue_type: "missing_source",
            platform,
            severity: "critical",
            title: `${name}: ${platform} 데이터 없음`,
            description: `${platform} 플랫폼에서 수집된 스냅샷이 0건입니다.`,
            expected_value: "1건 이상",
            actual_value: "0건",
          });
          continue;
        }

        const latest = snapshots?.[0];
        const latestTime = new Date(latest.collected_at).getTime();

        // ── Check 2: Stale data (>26h since last collection) ──
        if (now.getTime() - latestTime > staleThresholdMs) {
          const hoursAgo = Math.round(
            (now.getTime() - latestTime) / (1000 * 60 * 60)
          );
          issues.push({
            wiki_entry_id: wikiId,
            artist_name: name,
            issue_type: "stale_data",
            platform,
            severity: hoursAgo > 48 ? "high" : "medium",
            title: `${name}: ${platform} 수집 지연 (${hoursAgo}h)`,
            description: `마지막 수집이 ${hoursAgo}시간 전입니다. 정상 주기는 6시간입니다.`,
            expected_value: "≤26h",
            actual_value: `${hoursAgo}h`,
          });
        }

        // ── Check 3: New collection spike (0→big jump) ──
        if (snapshots && snapshots.length >= 2) {
          const prev = snapshots[1];
          const curr = snapshots[0];
          const prevMetrics = prev.metrics as Record<string, number>;
          const currMetrics = curr.metrics as Record<string, number>;

          // Check for metrics that were 0 and jumped
          for (const key of Object.keys(currMetrics || {})) {
            const prevVal = prevMetrics?.[key] ?? 0;
            const currVal = currMetrics?.[key] ?? 0;
            if (
              prevVal === 0 &&
              currVal > 100 &&
              typeof currVal === "number"
            ) {
              issues.push({
                wiki_entry_id: wikiId,
                artist_name: name,
                issue_type: "new_collection_spike",
                platform,
                severity: "medium",
                title: `${name}: ${platform}.${key} 초기 수집 급증`,
                description: `${key} 값이 0에서 ${currVal.toLocaleString()}로 급증. 초기 수집으로 인한 왜곡 가능성.`,
                expected_value: "점진적 증가",
                actual_value: `0 → ${currVal.toLocaleString()}`,
              });
            }
          }
        }

        // ── Check 4: Zero/null metrics on major fields ──
        if (latest?.metrics) {
          const metrics = latest.metrics as Record<string, unknown>;
          const majorFields: Record<string, string[]> = {
            youtube: ["viewCount", "subscriberCount"],
            youtube_music: ["viewCount"],
            lastfm: ["playcount", "listeners"],
            deezer: ["fans"],
            buzz_multi: ["total_score"],
          };
          const fieldsToCheck = majorFields[platform] || [];
          for (const field of fieldsToCheck) {
            const val = metrics[field];
            if (val === 0 || val === null || val === undefined) {
              issues.push({
                wiki_entry_id: wikiId,
                artist_name: name,
                issue_type: "zero_score",
                platform,
                severity: "high",
                title: `${name}: ${platform}.${field} = 0`,
                description: `Tier 1 아티스트의 ${field} 값이 0 또는 null입니다. API 오류 또는 식별자 오류 가능성.`,
                expected_value: "> 0",
                actual_value: String(val ?? "null"),
              });
            }
          }
        }
      }

      // ── Check 5: Score anomalies from v3_scores_v2 ──
      const { data: scores } = await supabase
        .from("v3_scores_v2")
        .select("*")
        .eq("wiki_entry_id", wikiId)
        .limit(1)
        .maybeSingle();

      if (scores) {
        const scoreFields = [
          { key: "youtube_score", label: "YouTube Score" },
          { key: "music_score", label: "Music Score" },
          { key: "buzz_score", label: "Buzz Score" },
          { key: "social_score", label: "Social Score" },
        ];
        for (const sf of scoreFields) {
          const val = (scores as any)[sf.key];
          if (val === 0 || val === null) {
            issues.push({
              wiki_entry_id: wikiId,
              artist_name: name,
              issue_type: "zero_score",
              platform: sf.key,
              severity: "high",
              title: `${name}: ${sf.label} = 0`,
              description: `Tier 1 아티스트의 ${sf.label}이 0입니다. 해당 데이터 소스 수집 실패 가능성.`,
              expected_value: "> 0",
              actual_value: String(val ?? "null"),
            });
          }
        }
      }

      // ── Check 6: Missing API identifiers (direct columns) ──
      const requiredIds: { key: keyof typeof artist; label: string }[] = [
        { key: "youtube_channel_id", label: "YouTube Channel ID" },
        { key: "lastfm_artist_name", label: "Last.fm Name" },
        { key: "deezer_artist_id", label: "Deezer ID" },
      ];
      for (const rid of requiredIds) {
        const val = artist[rid.key];
        if (!val || val === "" || val === "null") {
          issues.push({
            wiki_entry_id: wikiId,
            artist_name: name,
            issue_type: "missing_source",
            platform: rid.key as string,
            severity: "high",
            title: `${name}: ${rid.label} 미설정`,
            description: `${rid.label}가 없어 해당 플랫폼 수집이 불가능합니다.`,
            expected_value: "설정됨",
            actual_value: "없음",
          });
        }
      }

      // ── Check 6b: Verify Deezer ID points to correct artist ──
      if (verifyIds && artist.deezer_artist_id && artist.deezer_artist_id !== "" && artist.deezer_artist_id !== "null") {
        try {
          const deezerResp = await fetch(`https://api.deezer.com/artist/${artist.deezer_artist_id}`);
          const deezerData = await deezerResp.json();
          if (deezerData && !deezerData.error) {
            const deezerName = (deezerData.name || "").toLowerCase();
            const expectedName = name.toLowerCase();
            // Check if names match (fuzzy: one contains the other)
            const match = deezerName.includes(expectedName) || expectedName.includes(deezerName)
              || deezerName.replace(/\s/g, "") === expectedName.replace(/\s/g, "");
            if (!match) {
              // Also check fans count - if too low for a known artist, likely wrong
              const fans = deezerData.nb_fan || 0;
              issues.push({
                wiki_entry_id: wikiId,
                artist_name: name,
                issue_type: "wrong_identifier",
                platform: "deezer_artist_id",
                severity: "critical",
                title: `${name}: Deezer ID가 다른 아티스트를 가리킴`,
                description: `저장된 Deezer ID ${artist.deezer_artist_id}의 실제 아티스트: "${deezerData.name}" (fans: ${fans.toLocaleString()}). 예상: "${name}"`,
                expected_value: name,
                actual_value: `${deezerData.name} (ID: ${artist.deezer_artist_id}, fans: ${fans.toLocaleString()})`,
              });
              console.log(`[Auditor] ⚠️ Deezer mismatch: ${name} → stored ID ${artist.deezer_artist_id} resolves to "${deezerData.name}" (${fans} fans)`);

              // Try to find the correct ID
              const searchResp = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=3`);
              const searchData = await searchResp.json();
              if (searchData?.data?.length > 0) {
                const best = searchData.data[0];
                console.log(`[Auditor] 💡 Suggested correct Deezer ID for ${name}: ${best.id} ("${best.name}", ${best.nb_fan} fans)`);
              }
            }
          }
        } catch (e) {
          console.warn(`[Auditor] Deezer verify failed for ${name}: ${(e as Error).message}`);
        }
      }

      // ── Check 6c: Verify Last.fm name resolves correctly ──
      if (verifyIds && artist.lastfm_artist_name && artist.lastfm_artist_name !== "") {
        try {
          const LASTFM_KEY = Deno.env.get("LASTFM_API_KEY");
          if (LASTFM_KEY) {
            const lfmResp = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist.lastfm_artist_name)}&api_key=${LASTFM_KEY}&format=json`);
            const lfmData = await lfmResp.json();
            if (lfmData?.error) {
              issues.push({
                wiki_entry_id: wikiId,
                artist_name: name,
                issue_type: "wrong_identifier",
                platform: "lastfm_artist_name",
                severity: "high",
                title: `${name}: Last.fm 이름 조회 실패`,
                description: `"${artist.lastfm_artist_name}" → Last.fm API 에러: ${lfmData.message}`,
                expected_value: "유효한 아티스트",
                actual_value: `Error: ${lfmData.message}`,
              });
            } else if (lfmData?.artist) {
              const listeners = parseInt(lfmData.artist.stats?.listeners || "0");
              if (listeners < 1000) {
                issues.push({
                  wiki_entry_id: wikiId,
                  artist_name: name,
                  issue_type: "wrong_identifier",
                  platform: "lastfm_artist_name",
                  severity: "high",
                  title: `${name}: Last.fm 리스너 비정상 (${listeners})`,
                  description: `"${artist.lastfm_artist_name}"의 리스너가 ${listeners}명으로 Tier 1 아티스트치고 너무 적습니다. 동명이인 가능성.`,
                  expected_value: "> 10,000",
                  actual_value: `${listeners.toLocaleString()} listeners`,
                });
              }
            }
          }
        } catch (e) {
          console.warn(`[Auditor] Last.fm verify failed for ${name}: ${(e as Error).message}`);
        }
      }

      // ── Check 7: Geo data coverage ──
      for (const geoSource of REQUIRED_GEO_SOURCES) {
        const { count } = await supabase
          .from("ktrenz_geo_fan_data")
          .select("id", { count: "exact", head: true })
          .eq("wiki_entry_id", wikiId)
          .eq("source", geoSource);

        if (!count || count === 0) {
          issues.push({
            wiki_entry_id: wikiId,
            artist_name: name,
            issue_type: "missing_source",
            platform: `geo_${geoSource}`,
            severity: "medium",
            title: `${name}: Geo(${geoSource}) 데이터 없음`,
            description: `${geoSource} 소스의 지리 데이터가 없습니다.`,
            expected_value: "1건 이상",
            actual_value: "0건",
          });
        }
      }
    }

    // ── Upsert issues (resolved=false unique constraint handles dedup) ──
    let inserted = 0;
    let skipped = 0;
    for (const issue of issues) {
      const { error } = await supabase
        .from("ktrenz_data_quality_issues")
        .upsert(
          {
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
          },
          {
            onConflict: "wiki_entry_id,issue_type,platform",
            ignoreDuplicates: false,
          }
        );
      if (error) {
        skipped++;
      } else {
        inserted++;
      }
    }

    // ── Auto-resolve issues that no longer exist ──
    // Get all currently open issues
    const { data: openIssues } = await supabase
      .from("ktrenz_data_quality_issues")
      .select("id, wiki_entry_id, issue_type, platform")
      .eq("resolved", false);

    if (openIssues) {
      const issueKeys = new Set(
        issues.map(
          (i) => `${i.wiki_entry_id}|${i.issue_type}|${i.platform}`
        )
      );
      const toResolve = openIssues.filter(
        (o) => !issueKeys.has(`${o.wiki_entry_id}|${o.issue_type}|${o.platform}`)
      );
      for (const r of toResolve) {
        await supabase
          .from("ktrenz_data_quality_issues")
          .update({
            resolved: true,
            resolved_at: new Date().toISOString(),
            resolution_note: "자동 해결: 최신 감사에서 이슈 미감지",
          })
          .eq("id", r.id);
      }
    }

    const summary = {
      artists_checked: artists.length,
      issues_found: issues.length,
      inserted,
      skipped,
      by_severity: {
        critical: issues.filter((i) => i.severity === "critical").length,
        high: issues.filter((i) => i.severity === "high").length,
        medium: issues.filter((i) => i.severity === "medium").length,
        low: issues.filter((i) => i.severity === "low").length,
      },
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
