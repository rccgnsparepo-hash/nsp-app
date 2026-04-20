// Edge function: send-notification
// Sends push via OneSignal REST API.
// Accepts:
//   { broadcast: true } → all subscribed users (segment "Subscribed Users")
//   { userIds: [uuid] }  → targets via external_user_id (set on login by OneSignal.login)
//   { playerIds: [...] } → fallback for explicit player ids

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error("[send-notification] Missing ONESIGNAL env vars");
      return new Response(
        JSON.stringify({ error: "OneSignal credentials are not configured", phase: "env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as Payload;
    if (!body?.title || !body?.message) {
      return new Response(
        JSON.stringify({ error: "title and message are required", phase: "validation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const oneSignalPayload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: body.title },
      contents: { en: body.message },
      data: body.data ?? {},
    };

    if (body.broadcast) {
      // Reach every subscribed device (works even before user logs in)
      oneSignalPayload.included_segments = ["Subscribed Users"];
    } else if (Array.isArray(body.userIds) && body.userIds.length > 0) {
      // Target by external user id (Supabase auth user id)
      oneSignalPayload.include_external_user_ids = body.userIds;
      oneSignalPayload.channel_for_external_user_ids = "push";
    } else if (Array.isArray(body.playerIds) && body.playerIds.length > 0) {
      oneSignalPayload.include_player_ids = body.playerIds;
    } else {
      return new Response(
        JSON.stringify({ ok: true, delivered: 0, note: "No recipients specified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.url) oneSignalPayload.url = body.url;

    console.log("[send-notification] Dispatching", JSON.stringify({
      broadcast: !!body.broadcast,
      userIds: body.userIds?.length ?? 0,
      playerIds: body.playerIds?.length ?? 0,
      title: body.title,
    }));

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
      console.error("[send-notification] OneSignal error", result);
      return new Response(JSON.stringify({ error: result, phase: "onesignal" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-notification] OneSignal OK", result);
    return new Response(
      JSON.stringify({ ok: true, oneSignal: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-notification] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message, phase: "exception" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
