import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { AccessToken } from 'npm:livekit-server-sdk@2.15.4';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { session_id, identity_name } = await req.json();
    if (!session_id) return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const apiKey = Deno.env.get('LIVEKIT_API_KEY')!;
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')!;
    const url = Deno.env.get('LIVEKIT_URL')!;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: identity_name ?? user.email ?? 'user',
      ttl: 60 * 60,
    });
    at.addGrant({ roomJoin: true, room: `call-${session_id}`, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();

    return new Response(JSON.stringify({ token, url, room: `call-${session_id}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
