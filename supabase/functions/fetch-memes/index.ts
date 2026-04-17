import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check cache (15 min)
    const { data: existing } = await supabase
      .from('memes_cache')
      .select('fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.fetched_at) {
      const ageMin = (Date.now() - new Date(existing.fetched_at).getTime()) / 60000;
      if (ageMin < 15) {
        return new Response(JSON.stringify({ cached: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Imgflip free public endpoint - no API key needed
    const res = await fetch('https://api.imgflip.com/get_memes');
    const json = await res.json();
    const memes = (json?.data?.memes || []).slice(0, 30);

    if (memes.length > 0) {
      const rows = memes.map((m: any) => ({
        external_id: `imgflip_${m.id}`,
        title: m.name,
        image_url: m.url,
        source: 'imgflip',
      }));
      await supabase.from('memes_cache').upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false });
    }

    return new Response(JSON.stringify({ count: memes.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
