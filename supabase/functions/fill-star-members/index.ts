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
    const { dryRun = false, offset = 0, limit = 5 } = body;

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
