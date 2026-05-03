// Edge function: send-notification
// Sends push via OneSignal REST API.
// Production origin: https://nsp-main-app.vercel.app
//
// Accepts:
//   { broadcast: true } → all subscribed users (segment "Subscribed Users")
//   { userIds: [uuid] }  → targets via external_user_id (set on login by OneSignal.login)
//   { playerIds: [...] } → fallback for explicit player ids

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
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

    let target: string;
    if (body.broadcast) {
      oneSignalPayload.included_segments = ["Subscribed Users"];
      target = "broadcast:Subscribed Users";
    } else if (Array.isArray(body.userIds) && body.userIds.length > 0) {
      oneSignalPayload.include_external_user_ids = body.userIds;
      oneSignalPayload.channel_for_external_user_ids = "push";
      target = `external_user_ids[${body.userIds.length}]`;
    } else if (Array.isArray(body.playerIds) && body.playerIds.length > 0) {
      oneSignalPayload.include_player_ids = body.playerIds;
      target = `player_ids[${body.playerIds.length}]`;
    } else {
      return new Response(
        JSON.stringify({ ok: true, delivered: 0, note: "No recipients specified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.url) oneSignalPayload.url = body.url;

    console.log("[send-notification] dispatch", { target, title: body.title });

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
      console.error("[send-notification] OneSignal HTTP error", res.status, result);
      return new Response(JSON.stringify({ ok: false, error: result, phase: "onesignal_http" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OneSignal returns 200 with errors:["All included players are not subscribed"] when nobody matches.
    if (result?.errors) {
      console.warn("[send-notification] OneSignal soft error", { target, errors: result.errors, recipients: result.recipients });
      const noSubs = Array.isArray(result.errors)
        && result.errors.some((e: string) => typeof e === "string" && e.toLowerCase().includes("not subscribed"));
      return new Response(
        JSON.stringify({
          ok: false,
          reason: noSubs ? "no_subscribers" : "onesignal_soft_error",
          oneSignal: result,
          hint: noSubs
            ? "No OneSignal subscriptions matched. Verify users have granted push permission on https://nsp-main-app.vercel.app and that the OneSignal Site URL matches."
            : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[send-notification] OK", { target, recipients: result?.recipients, id: result?.id });
    return new Response(
      JSON.stringify({ ok: true, oneSignal: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-notification] exception", e);
    return new Response(JSON.stringify({ error: (e as Error).message, phase: "exception" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
