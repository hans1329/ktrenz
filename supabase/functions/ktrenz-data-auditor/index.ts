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

    // For full audit, skip external API verification to avoid timeout
    if (!targetWikiEntryId) verifyIds = false;

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
        JSON.stringify({ message: "No artists found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wikiIds = artists.map(a => a.wiki_entry_id);
    const issues: Issue[] = [];
    const now = new Date();
    const staleMs = 26 * 60 * 60 * 1000;

    // ── Bulk: latest snapshots (last 30h to cover stale check) ──
    const cutoff = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();

    // Fetch in batches of 10 wiki_entry_ids to keep queries fast
    const snapshotMap = new Map<string, any[]>();
    const batchSize = 10;
    for (let i = 0; i < wikiIds.length; i += batchSize) {
      const batch = wikiIds.slice(i, i + batchSize);
      const { data } = await supabase
        .from("ktrenz_data_snapshots")
        .select("wiki_entry_id, platform, collected_at, metrics")
        .in("wiki_entry_id", batch)
        .in("platform", REQUIRED_PLATFORMS)
        .gte("collected_at", cutoff)
        .order("collected_at", { ascending: false })
        .limit(200);

      for (const snap of (data || [])) {
        const key = `${snap.wiki_entry_id}|${snap.platform}`;
        if (!snapshotMap.has(key)) snapshotMap.set(key, []);
        const arr = snapshotMap.get(key)!;
        if (arr.length < 2) arr.push(snap);
      }
    }

    // ── Bulk: scores ──
    const { data: allScores } = await supabase
      .from("v3_scores_v2")
      .select("wiki_entry_id, youtube_score, music_score, buzz_score, social_score")
      .in("wiki_entry_id", wikiIds);

    const scoresMap = new Map((allScores || []).map(s => [s.wiki_entry_id, s]));

    // ── Process each artist ──
    for (const artist of artists) {
      const wikiId = artist.wiki_entry_id;
      const name = artist.display_name;

      // Check platforms
      for (const platform of REQUIRED_PLATFORMS) {
        const snapshots = snapshotMap.get(`${wikiId}|${platform}`);

        if (!snapshots || snapshots.length === 0) {
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "stale_data", platform, severity: "high",
            title: `${name}: ${platform} 수집 지연/없음`,
            description: `최근 30시간 이내 ${platform} 수집 데이터가 없습니다.`,
            expected_value: "≤26h", actual_value: "없음/30h+",
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
            severity: "medium",
            title: `${name}: ${platform} 수집 지연 (${hoursAgo}h)`,
            description: `마지막 수집이 ${hoursAgo}시간 전입니다.`,
            expected_value: "≤26h", actual_value: `${hoursAgo}h`,
          });
        }

        // Zero metrics
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
                description: `${field} 값이 0/null입니다.`,
                expected_value: "> 0", actual_value: String(val ?? "null"),
              });
            }
          }
        }
      }

      // Scores check
      const scores = scoresMap.get(wikiId);
      if (scores) {
        for (const sf of [
          { key: "youtube_score", label: "YouTube" },
          { key: "music_score", label: "Music" },
          { key: "buzz_score", label: "Buzz" },
          { key: "social_score", label: "Social" },
        ]) {
          const val = (scores as any)[sf.key];
          if (val === 0 || val === null) {
            issues.push({
              wiki_entry_id: wikiId, artist_name: name,
              issue_type: "zero_score", platform: sf.key, severity: "high",
              title: `${name}: ${sf.label} Score = 0`,
              description: `${sf.label} 점수가 0입니다.`,
              expected_value: "> 0", actual_value: String(val ?? "null"),
            });
          }
        }
      }

      // Missing identifiers
      for (const rid of [
        { key: "youtube_channel_id" as const, label: "YouTube Channel ID" },
        { key: "lastfm_artist_name" as const, label: "Last.fm Name" },
        { key: "deezer_artist_id" as const, label: "Deezer ID" },
      ]) {
        const val = artist[rid.key];
        if (!val || val === "" || val === "null") {
          issues.push({
            wiki_entry_id: wikiId, artist_name: name,
            issue_type: "missing_source", platform: rid.key, severity: "high",
            title: `${name}: ${rid.label} 미설정`,
            description: `${rid.label}가 없습니다.`,
            expected_value: "설정됨", actual_value: "없음",
          });
        }
      }

      // Deezer ID verification (single artist only)
      if (verifyIds && artist.deezer_artist_id && artist.deezer_artist_id !== "") {
        try {
          const resp = await fetch(`https://api.deezer.com/artist/${artist.deezer_artist_id}`);
          const d = await resp.json();
          if (d && !d.error) {
            const dn = (d.name || "").toLowerCase();
            const en = name.toLowerCase();
            const match = dn.includes(en) || en.includes(dn) || dn.replace(/\s/g, "") === en.replace(/\s/g, "");
            if (!match) {
              issues.push({
                wiki_entry_id: wikiId, artist_name: name,
                issue_type: "wrong_identifier", platform: "deezer_artist_id", severity: "critical",
                title: `${name}: Deezer ID 불일치`,
                description: `ID ${artist.deezer_artist_id} → "${d.name}" (fans: ${(d.nb_fan||0).toLocaleString()})`,
                expected_value: name,
                actual_value: `${d.name} (ID: ${artist.deezer_artist_id})`,
              });
              console.log(`[Auditor] ⚠️ Deezer mismatch: ${name} → "${d.name}"`);
              try {
                const sr = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`);
                const sd = await sr.json();
                if (sd?.data?.[0]) console.log(`[Auditor] 💡 Correct: ${sd.data[0].id} "${sd.data[0].name}" (${sd.data[0].nb_fan} fans)`);
              } catch {}
            }
          }
        } catch {}
      }

      // Last.fm verification (single artist only)
      if (verifyIds && artist.lastfm_artist_name) {
        try {
          const k = Deno.env.get("LASTFM_API_KEY");
          if (k) {
            const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist.lastfm_artist_name)}&api_key=${k}&format=json`);
            const d = await r.json();
            if (d?.error) {
              issues.push({
                wiki_entry_id: wikiId, artist_name: name,
                issue_type: "wrong_identifier", platform: "lastfm_artist_name", severity: "high",
                title: `${name}: Last.fm 조회 실패`,
                description: `"${artist.lastfm_artist_name}" → ${d.message}`,
                expected_value: "유효", actual_value: d.message,
              });
            } else if (d?.artist) {
              const listeners = parseInt(d.artist.stats?.listeners || "0");
              if (listeners < 1000) {
                issues.push({
                  wiki_entry_id: wikiId, artist_name: name,
                  issue_type: "wrong_identifier", platform: "lastfm_artist_name", severity: "high",
                  title: `${name}: Last.fm 리스너 비정상`,
                  description: `"${artist.lastfm_artist_name}" 리스너 ${listeners}명. 동명이인 가능성.`,
                  expected_value: "> 10,000", actual_value: `${listeners}`,
                });
              }
            }
          }
        } catch {}
      }
    }

    // ── Batch upsert ──
    let inserted = 0, skipped = 0;
    const batchUpsertSize = 20;
    for (let i = 0; i < issues.length; i += batchUpsertSize) {
      const batch = issues.slice(i, i + batchUpsertSize).map(issue => ({
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
      }));
      const { error } = await supabase
        .from("ktrenz_data_quality_issues")
        .upsert(batch, { onConflict: "wiki_entry_id,issue_type,platform", ignoreDuplicates: false });
      if (error) skipped += batch.length;
      else inserted += batch.length;
    }

    // Auto-resolve (full audit only)
    let autoResolved = 0;
    if (!targetWikiEntryId) {
      const { data: open } = await supabase
        .from("ktrenz_data_quality_issues")
        .select("id, wiki_entry_id, issue_type, platform")
        .eq("resolved", false);
      if (open) {
        const keys = new Set(issues.map(i => `${i.wiki_entry_id}|${i.issue_type}|${i.platform}`));
        const toResolve = open.filter(o => !keys.has(`${o.wiki_entry_id}|${o.issue_type}|${o.platform}`)).map(o => o.id);
        if (toResolve.length > 0) {
          await supabase
            .from("ktrenz_data_quality_issues")
            .update({ resolved: true, resolved_at: new Date().toISOString(), resolution_note: "자동 해결" })
            .in("id", toResolve);
          autoResolved = toResolve.length;
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
