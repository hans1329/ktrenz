// fill-star-members: Wikipedia API로 K-pop 그룹의 멤버 데이터를 수집하여 ktrenz_stars에 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WIKI_API = "https://en.wikipedia.org/w/api.php";

// Wikipedia 검색명 매핑 (위키 페이지 타이틀이 display_name과 다른 경우)
const WIKI_TITLE_MAP: Record<string, string> = {
  "BTS": "BTS",
  "BLACKPINK": "Blackpink",
  "EXO": "Exo",
  "TWICE": "Twice (group)",
  "Red Velvet": "Red Velvet (group)",
  "Girls Generation": "Girls' Generation",
  "NCT": "NCT (group)",
  "NCT 127": "NCT 127",
  "NCT Dream": "NCT Dream",
  "SEVENTEEN": "Seventeen (South Korean band)",
  "Stray Kids": "Stray Kids",
  "ATEEZ": "Ateez",
  "ENHYPEN": "Enhypen",
  "aespa": "Aespa",
  "Ive": "Ive (group)",
  "NewJeans": "NewJeans",
  "LE SSERAFIM": "Le Sserafim",
  "(G)I-DLE": "(G)I-dle",
  "TREASURE": "Treasure (group)",
  "The Boyz": "The Boyz (South Korean group)",
  "Monsta X": "Monsta X",
  "SHINee": "Shinee",
  "Super Junior": "Super Junior",
  "iKON": "IKON (South Korean band)",
  "BIGBANG": "Big Bang (South Korean band)",
  "WINNER": "Winner (band)",
  "Babymonster": "BabyMonster",
  "RIIZE": "Riize",
  "NMIXX": "Nmixx",
  "BOYNEXTDOOR": "Boynextdoor",
  "PLAVE": "Plave",
  "Kep1er": "Kep1er",
  "STAYC": "StayC",
  "OH MY GIRL": "Oh My Girl",
  "EVERGLOW": "Everglow",
  "Dreamcatcher": "Dreamcatcher (group)",
  "CRAVITY": "Cravity",
  "P1Harmony": "P1Harmony",
  "AB6IX": "AB6IX",
  "CIX": "CIX (group)",
  "ONEUS": "Oneus",
  "TEMPEST": "Tempest (South Korean band)",
  "KISS OF LIFE": "Kiss of Life (group)",
  "ASTRO": "Astro (South Korean band)",
  "Highlight": "Highlight (South Korean band)",
  "CNBLUE": "CNBLUE",
  "Block B": "Block B",
  "EXID": "EXID",
  "EPEX": "Epex",
  "EPIK HIGH": "Epik High",
  "CLC": "CLC (group)",
  "KARD": "Kard (group)",
  "ONF": "ONF (group)",
  "TVXQ": "TVXQ",
  "Wanna One": "Wanna One",
  "ZEROBASEONE": "Zerobaseone",
  "tripleS": "TripleS",
  "TWS": "TWS (group)",
  "Xikers": "Xikers",
  "MAMAMOO": "Mamamoo",
  "WayV": "WayV",
  "LOONA": "Loona (group)",
  "D1CE": "D1CE",
  "H.O.T": "H.O.T.",
  "H1-KEY": "H1-Key",
  "VIXX": "VIXX",
  "Lovelyz": "Lovelyz",
  "PRISTIN": "Pristin",
  "Rocket Punch": "Rocket Punch",
};

// 위키 API로 페이지 HTML 가져오기
async function fetchWikiPage(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    redirects: "1",
  });

  try {
    const res = await fetch(`${WIKI_API}?${params}`, {
      headers: { "User-Agent": "KTrendz/1.0 (contact@k-trendz.com)" },
    });
    const data = await res.json();
    if (data.error) return null;
    return data.parse?.wikitext?.["*"] || null;
  } catch {
    return null;
  }
}

// Wikitext에서 멤버 이름 추출
function extractMembers(wikitext: string): string[] {
  const members: string[] = [];

  // 1) Infobox의 members / current_members 필드에서 추출
  // 패턴: | members = ... 또는 | current_members = ...
  const memberFieldRegex = /\|\s*(?:members|current_members)\s*=\s*([\s\S]*?)(?=\n\||\n\}\})/gi;
  let match;
  while ((match = memberFieldRegex.exec(wikitext)) !== null) {
    const block = match[1];
    // [[Name]] 또는 [[Name|Display]] 패턴 추출
    const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(block)) !== null) {
      const name = (linkMatch[2] || linkMatch[1]).trim();
      // 날짜나 연도 같은 것 필터링
      if (name && !name.match(/^\d{4}/) && !name.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)/i)) {
        members.push(name);
      }
    }
    // plain text 이름 ({{flatlist}} 등에서)
    if (members.length === 0) {
      const plainNames = block.split(/\n\*\s*/).map(s => s.replace(/[[\]{}]/g, '').trim()).filter(s => s && s.length > 1 && !s.match(/^\d/));
      members.push(...plainNames);
    }
  }

  return [...new Set(members)];
}

// 한국어 위키에서 멤버의 한국어 이름 가져오기
async function fetchKoreanName(englishName: string): Promise<string | null> {
  // 영어 위키에서 한국어 위키 링크 찾기
  const params = new URLSearchParams({
    action: "query",
    titles: englishName,
    prop: "langlinks",
    lllang: "ko",
    format: "json",
    redirects: "1",
  });

  try {
    const res = await fetch(`${WIKI_API}?${params}`, {
      headers: { "User-Agent": "KTrendz/1.0 (contact@k-trendz.com)" },
    });
    const data = await res.json();
    const pages = data.query?.pages || {};
    for (const page of Object.values(pages) as any[]) {
      if (page.langlinks?.[0]?.["*"]) {
        return page.langlinks[0]["*"];
      }
    }
  } catch {}
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { dryRun = false, offset = 0, limit = 5, action = "fill" } = body;

    // Cleanup action: fix noisy data
    if (action === "cleanup") {
      // Remove noise entries
      const { data: deleted } = await supabase
        .from("ktrenz_stars")
        .delete()
        .in("display_name", ["plainlist|", "Members", "*Serim"])
        .select("id");

      // Fix "* " prefix
      const { data: prefixed } = await supabase
        .from("ktrenz_stars")
        .select("id, display_name")
        .like("display_name", "* %");

      let fixedPrefix = 0;
      for (const row of prefixed || []) {
        const cleaned = row.display_name.replace(/^\* /, "");
        await supabase.from("ktrenz_stars").update({ display_name: cleaned }).eq("id", row.id);
        fixedPrefix++;
      }

      // Fix Korean names with parenthetical suffixes like "(가수)", "(1998년)"
      const { data: koNames } = await supabase
        .from("ktrenz_stars")
        .select("id, name_ko")
        .not("name_ko", "is", null)
        .like("name_ko", "% (%");

      let fixedKo = 0;
      for (const row of koNames || []) {
        const cleaned = row.name_ko.replace(/ \(.*\)$/, "");
        await supabase.from("ktrenz_stars").update({ name_ko: cleaned }).eq("id", row.id);
        fixedKo++;
      }

      // Fix wrong Korean names (Wikipedia ko link returns wrong page)
      const koFixes: Record<string, string | null> = {
        "Winter": "윈터",
        "Karina": "카리나",
        "MJ": "엠제이",
        "SAN": null, // wrong mapping
        "Yunho": "윤호",
        "Ahyeon": "아현",
        "Pharita": "파리타",
        "Chiquita": null,
      };
      for (const [name, ko] of Object.entries(koFixes)) {
        if (ko) {
          await supabase.from("ktrenz_stars").update({ name_ko: ko }).eq("display_name", name).eq("star_type", "member");
        } else {
          await supabase.from("ktrenz_stars").update({ name_ko: null }).eq("display_name", name).eq("star_type", "member");
        }
      }

      return new Response(JSON.stringify({
        deleted: deleted?.length || 0,
        fixedPrefix,
        fixedKo,
        fixedManual: Object.keys(koFixes).length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sync action: v3_artist_tiers 데이터를 ktrenz_stars에 동기화 (step별 분리)
    if (action === "sync_v3") {
      const step = body.step || 1;
      const results: any = { step };

      if (step === 1) {
        // 소셜 핸들 동기화
        let socialUpdated = 0;
        const { data: tiers } = await supabase
          .from("v3_artist_tiers")
          .select("wiki_entry_id, youtube_channel_id, instagram_handle, x_handle, tiktok_handle")
          .eq("tier", 1);

        for (const t of tiers || []) {
          const handles: any = {};
          if (t.youtube_channel_id) handles.youtube = t.youtube_channel_id;
          if (t.instagram_handle) handles.instagram = t.instagram_handle;
          if (t.x_handle) handles.x = t.x_handle;
          if (t.tiktok_handle) handles.tiktok = t.tiktok_handle;
          if (Object.keys(handles).length > 0) {
            const { error } = await supabase
              .from("ktrenz_stars")
              .update({ social_handles: handles })
              .eq("wiki_entry_id", t.wiki_entry_id);
            if (!error) socialUpdated++;
          }
        }
        results.socialUpdated = socialUpdated;
      }

      if (step === 2) {
        // schema_type='member' 교정 + group_id 링크
        let typeFixed = 0, groupLinked = 0;
        const { data: memberEntries } = await supabase
          .from("wiki_entries")
          .select("id, metadata")
          .eq("schema_type", "member");

        for (const entry of memberEntries || []) {
          const meta = entry.metadata as any;
          const groupId = meta?.group_id;

          await supabase
            .from("ktrenz_stars")
            .update({ star_type: "member" })
            .eq("wiki_entry_id", entry.id)
            .neq("star_type", "member");
          typeFixed++;

          if (groupId) {
            const { data: groupStar } = await supabase
              .from("ktrenz_stars")
              .select("id")
              .eq("wiki_entry_id", groupId)
              .limit(1);
            if (groupStar?.[0]) {
              await supabase
                .from("ktrenz_stars")
                .update({ group_star_id: groupStar[0].id })
                .eq("wiki_entry_id", entry.id);
              groupLinked++;
            }
          }
        }
        results.typeFixed = typeFixed;
        results.groupLinked = groupLinked;
      }

      if (step === 3) {
        // 이름 패턴 + 수동 매핑
        let linked = 0;
        const prefixPatterns = [
          { prefix: "BTS ", groupName: "BTS" },
          { prefix: "NCT ", groupName: "NCT" },
        ];
        for (const { prefix, groupName } of prefixPatterns) {
          const { data: groupStar } = await supabase
            .from("ktrenz_stars").select("id")
            .eq("display_name", groupName).eq("star_type", "group").limit(1);
          if (groupStar?.[0]) {
            const { data: prefixed } = await supabase
              .from("ktrenz_stars").select("id")
              .like("display_name", `${prefix}%`).neq("display_name", groupName);
            for (const s of prefixed || []) {
              await supabase.from("ktrenz_stars")
                .update({ star_type: "member", group_star_id: groupStar[0].id }).eq("id", s.id);
              linked++;
            }
          }
        }

        const manualLinks: Record<string, string> = {
          "GD": "BIGBANG", "Nayeon": "TWICE", "Hwa Sa": "MAMAMOO",
          "Sunmi": "Wonder Girls", "Bobby": "iKON",
        };
        for (const [member, group] of Object.entries(manualLinks)) {
          const { data: g } = await supabase.from("ktrenz_stars").select("id")
            .eq("display_name", group).eq("star_type", "group").limit(1);
          if (g?.[0]) {
            await supabase.from("ktrenz_stars")
              .update({ star_type: "member", group_star_id: g[0].id })
              .eq("display_name", member).is("group_star_id", null);
            linked++;
          }
        }
        results.linked = linked;
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ktrenz_stars에서 group 타입만 가져오기
    const { data: groups, error: groupErr } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, wiki_entry_id")
      .eq("star_type", "group")
      .eq("is_active", true)
      .order("display_name")
      .range(offset, offset + limit - 1);

    if (groupErr) throw groupErr;

    const results: any[] = [];
    let totalInserted = 0;

    for (const group of groups || []) {
      const wikiTitle = WIKI_TITLE_MAP[group.display_name] || group.display_name;
      console.log(`Processing: ${group.display_name} → wiki: ${wikiTitle}`);

      const wikitext = await fetchWikiPage(wikiTitle);
      if (!wikitext) {
        results.push({ group: group.display_name, status: "wiki_not_found" });
        continue;
      }

      const members = extractMembers(wikitext);
      if (members.length === 0) {
        results.push({ group: group.display_name, status: "no_members_found" });
        continue;
      }

      console.log(`  Found ${members.length} members: ${members.join(", ")}`);

      if (dryRun) {
        results.push({ group: group.display_name, members, status: "dry_run" });
        continue;
      }

      // 멤버 데이터 삽입 (중복 방지)
      let inserted = 0;
      for (const memberName of members) {
        // 이미 존재하는지 확인
        const { data: existing } = await supabase
          .from("ktrenz_stars")
          .select("id")
          .eq("display_name", memberName)
          .eq("group_star_id", group.id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // 한국어 이름 조회
        const nameKo = await fetchKoreanName(memberName);

        const { error: insertErr } = await supabase
          .from("ktrenz_stars")
          .insert({
            display_name: memberName,
            name_ko: nameKo,
            star_type: "member",
            group_star_id: group.id,
            is_active: true,
          });

        if (!insertErr) {
          inserted++;
          totalInserted++;
        } else {
          console.error(`  Error inserting ${memberName}:`, insertErr.message);
        }

        // Rate limit: Wikipedia API 예의
        await new Promise(r => setTimeout(r, 200));
      }

      results.push({
        group: group.display_name,
        members,
        inserted,
        status: "ok",
      });
    }

    return new Response(
      JSON.stringify({
        processed: groups?.length || 0,
        totalInserted,
        offset,
        limit,
        results,
        nextOffset: offset + limit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
