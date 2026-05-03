// Edge function: send-notification
// Sends push via OneSignal REST API + logs every dispatch to notification_dispatch_logs.
// Production origin: https://nsp-main-app.vercel.app

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function logDispatch(row: Record<string, unknown>) {
  try {
    const { error } = await admin.from("notification_dispatch_logs").insert(row);
    if (error) console.error("[send-notification] log insert error", error);
  } catch (e) {
    console.error("[send-notification] log threw", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Payload | null = null;
  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      await logDispatch({ status: "error", error: "Missing ONESIGNAL env vars", target_type: "env" });
      return new Response(
        JSON.stringify({ error: "OneSignal credentials are not configured", phase: "env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    body = (await req.json()) as Payload;
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

    let target_type: string;
    let target_value: unknown = null;
    let user_ids: string[] | null = null;

    if (body.broadcast) {
      oneSignalPayload.included_segments = ["Subscribed Users"];
      target_type = "broadcast";
      target_value = ["Subscribed Users"];
    } else if (Array.isArray(body.userIds) && body.userIds.length > 0) {
      oneSignalPayload.include_external_user_ids = body.userIds;
      oneSignalPayload.channel_for_external_user_ids = "push";
      target_type = "external_user_ids";
      target_value = body.userIds;
      user_ids = body.userIds;
    } else if (Array.isArray(body.playerIds) && body.playerIds.length > 0) {
      oneSignalPayload.include_player_ids = body.playerIds;
      target_type = "player_ids";
      target_value = body.playerIds;
    } else {
      await logDispatch({
        title: body.title, body: body.message, status: "skipped",
        error: "No recipients specified", target_type: "none",
        request_payload: body as unknown as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({ ok: true, delivered: 0, note: "No recipients specified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.url) oneSignalPayload.url = body.url;

    console.log("[send-notification] dispatch", { target_type, title: body.title });

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(oneSignalPayload),
    });

    const result = await res.json();
    const recipients: number = typeof result?.recipients === "number" ? result.recipients : 0;
    const onesignal_id: string | null = result?.id ?? null;

    if (!res.ok) {
      console.error("[send-notification] OneSignal HTTP error", res.status, result);
      await logDispatch({
        title: body.title, body: body.message, target_type, target_value, user_ids,
        recipients, onesignal_id, status: "http_error",
        error: `HTTP ${res.status}`, raw_response: result,
        request_payload: body as unknown as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: false, error: result, phase: "onesignal_http" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result?.errors) {
      const noSubs = Array.isArray(result.errors)
        && result.errors.some((e: string) => typeof e === "string" && e.toLowerCase().includes("not subscribed"));
      console.warn("[send-notification] OneSignal soft error", { target_type, errors: result.errors });
      await logDispatch({
        title: body.title, body: body.message, target_type, target_value, user_ids,
        recipients, onesignal_id, status: noSubs ? "no_subscribers" : "soft_error",
        error: JSON.stringify(result.errors), raw_response: result,
        request_payload: body as unknown as Record<string, unknown>,
      });
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

    console.log("[send-notification] OK", { target_type, recipients, id: onesignal_id });
    await logDispatch({
      title: body.title, body: body.message, target_type, target_value, user_ids,
      recipients, onesignal_id, status: "sent",
      raw_response: result,
      request_payload: body as unknown as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({ ok: true, oneSignal: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-notification] exception", e);
    await logDispatch({
      title: body?.title ?? null, body: body?.message ?? null,
      status: "exception", error: (e as Error).message,
      request_payload: body as unknown as Record<string, unknown> ?? {},
    });
    return new Response(JSON.stringify({ error: (e as Error).message, phase: "exception" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
