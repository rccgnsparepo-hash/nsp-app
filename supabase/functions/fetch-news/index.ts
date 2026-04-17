import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_FEEDS: Record<string, string> = {
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  faith: 'https://www.christianpost.com/rss/news.xml',
};

function parseRSS(xml: string) {
  const items: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
    const block = match[1];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return null;
      return m[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
    };
    const imgMatch = block.match(/<media:thumbnail[^>]*url="([^"]+)"/) || block.match(/<enclosure[^>]*url="([^"]+)"/);
    items.push({
      title: get('title'),
      description: get('description')?.replace(/<[^>]+>/g, '').slice(0, 280),
      url: get('link'),
      image_url: imgMatch?.[1] || null,
      source: get('source') || 'News',
      published_at: get('pubDate') ? new Date(get('pubDate')!).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { category = 'world' } = await req.json().catch(() => ({}));
    const feedUrl = CATEGORY_FEEDS[category] || CATEGORY_FEEDS.world;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check cache (10 min)
    const { data: existing } = await supabase
      .from('news_cache')
      .select('fetched_at')
      .eq('category', category)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.fetched_at) {
      const ageMin = (Date.now() - new Date(existing.fetched_at).getTime()) / 60000;
      if (ageMin < 10) {
        return new Response(JSON.stringify({ cached: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const res = await fetch(feedUrl);
    const xml = await res.text();
    const items = parseRSS(xml);

    if (items.length > 0) {
      // Replace cache for category
      await supabase.from('news_cache').delete().eq('category', category);
      await supabase.from('news_cache').insert(
        items.map(i => ({ ...i, category }))
      );
    }

    return new Response(JSON.stringify({ count: items.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
