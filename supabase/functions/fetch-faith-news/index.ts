// fetch-faith-news: pulls RSS from faith outlets, caches in news_articles, returns latest.
// GET ?refresh=1 forces a refresh (otherwise auto-refresh every 30 min).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.christianpost.com/rss/most-popular.xml", source: "Christian Post" },
  { url: "https://premierchristian.news/rss", source: "Premier Christian News" },
  { url: "https://relevantmagazine.com/feed/", source: "Relevant" },
  { url: "https://www.christianitytoday.com/ct/rss/", source: "Christianity Today" },
  { url: "https://www.crosswalk.com/rss/", source: "Crosswalk" },
];

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

function pickTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "").trim();
}
function pickAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"[^>]*/?>`, "i"));
  return m ? m[1] : null;
}
function pickImage(xml: string): string | null {
  return pickAttr(xml, "media:content", "url")
      ?? pickAttr(xml, "media:thumbnail", "url")
      ?? pickAttr(xml, "enclosure", "url")
      ?? (xml.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null);
}

async function ingestFeed(feed: { url: string; source: string }) {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": "NSP-App/1.0" } });
    if (!res.ok) return 0;
    const xml = await res.text();
    const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? xml.match(/<entry[\s\S]*?<\/entry>/g) ?? [];
    const rows: any[] = [];
    for (const item of items.slice(0, 20)) {
      const title = pickTag(item, "title");
      const url = pickTag(item, "link") || pickAttr(item, "link", "href");
      const desc = (pickTag(item, "description") || pickTag(item, "summary") || "").slice(0, 400);
      const date = pickTag(item, "pubDate") || pickTag(item, "published") || pickTag(item, "updated");
      const img = pickImage(item);
      if (!title || !url) continue;
      rows.push({
        title, url, source: feed.source, image_url: img, summary: desc,
        category: "faith",
        published_at: date ? new Date(date).toISOString() : null,
        fetched_at: new Date().toISOString(),
      });
    }
    if (rows.length) await supabase.from("news_articles").upsert(rows, { onConflict: "url" });
    return rows.length;
  } catch (e) { console.error("feed err", feed.source, e); return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // Decide whether to refresh
  const force = url.searchParams.get("refresh") === "1";
  let needsRefresh = force;
  if (!force) {
    const { data } = await supabase.from("news_articles").select("fetched_at")
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) needsRefresh = true;
    else if (Date.now() - new Date(data.fetched_at).getTime() > 30 * 60 * 1000) needsRefresh = true;
  }

  let ingested = 0;
  if (needsRefresh) {
    const counts = await Promise.all(FEEDS.map(ingestFeed));
    ingested = counts.reduce((a, b) => a + b, 0);
  }

  const { data: articles } = await supabase.from("news_articles")
    .select("*").order("published_at", { ascending: false, nullsFirst: false }).limit(60);

  return new Response(JSON.stringify({ refreshed: needsRefresh, ingested, articles: articles ?? [] }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
