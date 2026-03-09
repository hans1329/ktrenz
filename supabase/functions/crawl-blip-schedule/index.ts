// crawl-blip-schedule: Scrape blip.kr K-pop schedule and store in ktrenz_schedules
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLIP_URL = "https://blip.kr/en/schedule";

// Category detection from event title
function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (/release|발매|comeback/.test(t)) return "release";
  if (/happy .+ day|birthday|생일|데뷔.*주년/.test(t)) return "celebration";
  if (/m countdown|music bank|inkigayo|음악중심|인기가요|broadcast|방송/.test(t)) return "broadcast";
  if (/concept photo|concept film|teaser|mv teaser|highlight medley|album cover|tracklist|album spoiler|music sampler|lap image/.test(t)) return "release";
  if (/purchase|구매|예약/.test(t)) return "purchase";
  if (/event|팬미팅|콘서트|concert|fan meeting/.test(t)) return "event";
  return "others";
}

// Parse date string like "(Mon) Mar 9th 5:00 AM" or "(Tue) Mar 10th"
function parseEventDate(dateStr: string, year: number): { date: string; time: string | null } {
  const cleaned = dateStr.replace(/\(.*?\)\s*/, "").trim();
  // Match "Mar 9th 5:00 AM" or "Mar 9th"
  const match = cleaned.match(/(\w+)\s+(\d+)(?:st|nd|rd|th)?(?:\s+(.+))?/);
  if (!match) return { date: "", time: null };

  const monthNames: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };

  const month = monthNames[match[1]];
  const day = parseInt(match[2]);
  if (!month || !day) return { date: "", time: null };

  const dateFormatted = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const time = match[3]?.trim() || null;

  return { date: dateFormatted, time };
}

// Parse the scraped markdown into schedule entries
function parseScheduleMarkdown(markdown: string): Array<{
  artist_name: string;
  title: string;
  event_date: string;
  event_time: string | null;
  category: string;
}> {
  const entries: Array<{
    artist_name: string;
    title: string;
    event_date: string;
    event_time: string | null;
    category: string;
  }> = [];

  // Detect year from header like "### 2026. 3"
  const yearMatch = markdown.match(/###?\s*(\d{4})\.\s*\d+/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

  // Parse "Today's Schedules" and "Upcoming schedules" sections
  // Pattern: "- EVENT_TITLE\n\n\n\n(Day) Mon DDth TIME\n\n...\nARTIST_NAME"
  const lines = markdown.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for schedule item starting with "- "
    if (line.startsWith("- ") && !line.startsWith("- [")) {
      const title = line.slice(2).trim();

      // Look ahead for date and artist name
      let dateStr = "";
      let artistName = "";

      // Scan forward for date line (contains day abbreviation and month)
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const ahead = lines[j].trim();

        // Date pattern: "(Mon) Mar 9th..." or just date-like text
        if (/\(\w+\)\s+\w+\s+\d+/.test(ahead)) {
          dateStr = ahead;
          // After date, find artist name (non-empty, non-image, non-date line)
          for (let k = j + 1; k < Math.min(j + 10, lines.length); k++) {
            const nameLine = lines[k].trim();
            if (
              nameLine &&
              !nameLine.startsWith("!") &&
              !nameLine.startsWith("- ") &&
              !nameLine.startsWith("(") &&
              !nameLine.startsWith("#") &&
              !nameLine.startsWith("|") &&
              !nameLine.includes("image.blip.kr") &&
              nameLine.length > 1 &&
              nameLine.length < 50
            ) {
              artistName = nameLine;
              break;
            }
          }
          break;
        }
      }

      if (title && dateStr && artistName) {
        const { date, time } = parseEventDate(dateStr, year);
        if (date) {
          entries.push({
            artist_name: artistName,
            title,
            event_date: date,
            event_time: time,
            category: detectCategory(title),
          });
        }
      }
    }
    i++;
  }

  return entries;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Fetch blip.kr schedule page
    console.log("[crawl-blip] Fetching blip.kr schedule...");
    const resp = await fetch(BLIP_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!resp.ok) {
      throw new Error(`blip.kr returned ${resp.status}`);
    }

    const html = await resp.text();

    // Check if we hit captcha
    if (html.includes("Soridata") || html.includes("보안 테스트")) {
      // This is soridata captcha, try alternative approach
      console.log("[crawl-blip] Direct fetch succeeded, parsing HTML...");
    }

    // Try using Firecrawl if available for better parsing
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    let markdown = "";

    if (firecrawlKey) {
      console.log("[crawl-blip] Using Firecrawl for better parsing...");
      const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: BLIP_URL,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });

      if (fcResp.ok) {
        const fcData = await fcResp.json();
        markdown = fcData?.data?.markdown || fcData?.markdown || "";
        console.log(`[crawl-blip] Firecrawl returned ${markdown.length} chars`);
      } else {
        console.warn("[crawl-blip] Firecrawl failed, falling back to direct parse");
      }
    }

    // If no Firecrawl or it failed, do basic HTML->text extraction
    if (!markdown) {
      // Basic extraction from HTML - strip tags
      markdown = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n");
    }

    // 2. Parse schedule entries
    const entries = parseScheduleMarkdown(markdown);
    console.log(`[crawl-blip] Parsed ${entries.length} schedule entries`);

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No entries parsed", entriesCount: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Match artist names to wiki_entries
    const uniqueArtists = [...new Set(entries.map((e) => e.artist_name))];
    console.log(`[crawl-blip] Matching ${uniqueArtists.length} artists...`);

    const { data: wikiEntries } = await supabase
      .from("wiki_entries")
      .select("id, title, korean_name")
      .in("title", uniqueArtists);

    const artistMap = new Map<string, string>();
    if (wikiEntries) {
      for (const we of wikiEntries) {
        artistMap.set(we.title.toLowerCase(), we.id);
        if (we.korean_name) artistMap.set(we.korean_name.toLowerCase(), we.id);
      }
    }

    // 4. Upsert into ktrenz_schedules
    const rows = entries.map((e) => ({
      wiki_entry_id: artistMap.get(e.artist_name.toLowerCase()) || null,
      artist_name: e.artist_name,
      title: e.title,
      event_date: e.event_date,
      event_time: e.event_time,
      category: e.category,
      source: "blip",
      source_url: BLIP_URL,
    }));

    const { error: upsertError, count } = await supabase
      .from("ktrenz_schedules" as any)
      .upsert(rows, { onConflict: "artist_name,title,event_date", ignoreDuplicates: false })
      .select("id");

    if (upsertError) {
      console.error("[crawl-blip] Upsert error:", upsertError);
      throw upsertError;
    }

    console.log(`[crawl-blip] Done! Upserted ${rows.length} schedule entries`);

    return new Response(
      JSON.stringify({
        success: true,
        entriesCount: rows.length,
        matchedArtists: artistMap.size,
        totalArtists: uniqueArtists.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[crawl-blip] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
