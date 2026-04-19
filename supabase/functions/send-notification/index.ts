// Edge function: send-notification
// Calls OneSignal REST API to deliver push notifications.
// Accepts either { broadcast: true } (sends to all subscribed users) or { playerIds: [...] }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  broadcast?: boolean;
  playerIds?: string[];
  userIds?: string[];
  title: string;
  message: string;
  data?: Record<string, unknown>;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OneSignal credentials are not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as Payload;
    if (!body?.title || !body?.message) {
      return new Response(
        JSON.stringify({ error: "title and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let playerIds: string[] = Array.isArray(body.playerIds) ? body.playerIds : [];

    // Resolve recipients via Supabase if needed
    if (body.broadcast || (body.userIds && body.userIds.length > 0)) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      let query = supabase.from("user_push_subscriptions").select("player_id, user_id");
      if (!body.broadcast && body.userIds) {
        query = query.in("user_id", body.userIds);
      }
      const { data: subs, error } = await query;
      if (error) throw error;
      playerIds = [...new Set([...playerIds, ...(subs?.map((s) => s.player_id) ?? [])])];
    }

    // OneSignal will reject the request if include_player_ids is empty.
    // Treat zero recipients as a soft success so triggers do not error.
    if (playerIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, delivered: 0, note: "No subscribed devices" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const oneSignalPayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: body.title },
      contents: { en: body.message },
      data: body.data ?? {},
    };
    if (body.url) oneSignalPayload.url = body.url;

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(oneSignalPayload),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("OneSignal error", result);
      return new Response(JSON.stringify({ error: result }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, delivered: playerIds.length, oneSignal: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-notification error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
