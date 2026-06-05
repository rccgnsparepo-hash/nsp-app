// Edge function: dispatch-notification
// Primary push path: ALWAYS sends via OneSignal (send-notification) so push works
// even when Zapier hooks are missing or fail. Also fires the legacy Zapier
// channel routing for any downstream automations.
//
// Adds:
// - dedupe_id → OneSignal web_push_topic (collapse key) + Notification.tag
// - url       → OneSignal web_url / launch URL for deep linking
// - parallel dispatch + structured logging

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface Payload {
  broadcast?: boolean;
  userIds?: string[];
  playerIds?: string[];
  title: string;
  message: string;
  data?: Record<string, unknown>;
  url?: string;
  dedupe_id?: string | null;
  group_key?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  preview?: string | null;
  target_mode?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRODUCTION_ORIGIN = "https://nsp-main-app.lovable.app";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ChannelKey =
  | "chat" | "gallery_post" | "voice_note" | "youtube_post"
  | "prayer" | "attendance" | "fallback";

function pickChannel(data: Record<string, unknown> | undefined): ChannelKey {
  const type = String(data?.type ?? "general");
  const postType = String(data?.post_type ?? "");
  if (type === "message" || type === "call") return "chat";
  if (type === "post_like" || type === "post_comment" || type === "repost") return "chat";
  if (type === "prayer" || type === "prayer_interaction") return "prayer";
  if (type === "attendance_session" || type === "attendance_review" || type === "attendance_pending") return "attendance";
  if (type === "post") {
    if (postType === "voice") return "voice_note";
    if (postType === "youtube") return "youtube_post";
    return "gallery_post";
  }
  return "fallback";
}

function getZapierWebhook(ch: ChannelKey): string | null {
  const map: Record<ChannelKey, string | undefined> = {
    chat: Deno.env.get("ZAPIER_WEBHOOK_CHAT"),
    gallery_post: Deno.env.get("ZAPIER_WEBHOOK_GALLERY_POST"),
    voice_note: Deno.env.get("ZAPIER_WEBHOOK_VOICE_NOTE"),
    youtube_post: Deno.env.get("ZAPIER_WEBHOOK_YOUTUBE_POST"),
    prayer: Deno.env.get("ZAPIER_WEBHOOK_PRAYER"),
    attendance: Deno.env.get("ZAPIER_WEBHOOK_ATTENDANCE"),
    fallback: Deno.env.get("ZAPIER_WEBHOOK_CHAT"),
  };
  return map[ch] ?? null;
}

function absoluteUrl(maybe: string | null | undefined): string {
  if (!maybe) return PRODUCTION_ORIGIN + "/inbox";
  if (maybe.startsWith("http")) return maybe;
  return PRODUCTION_ORIGIN + (maybe.startsWith("/") ? maybe : "/" + maybe);
}

async function callOneSignal(body: Payload, dedupeId: string | null, deepLink: string): Promise<{ ok: boolean; result: unknown; status: number }> {
  const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
  const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return { ok: false, result: { error: "missing OneSignal env" }, status: 500 };
  }

  const payload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: body.title },
    contents: { en: body.message },
    data: { ...(body.data ?? {}), url: deepLink, dedupe_id: dedupeId },
    web_url: deepLink,
    url: deepLink,
  };

  if (dedupeId) {
    // Collapse re-sends of the same logical event on web/Android
    payload.web_push_topic = dedupeId.slice(0, 40);
    payload.collapse_id = dedupeId.slice(0, 40);
  }

  if (body.broadcast) {
    payload.included_segments = ["Subscribed Users", "All"];
  } else if (body.userIds?.length) {
    payload.include_external_user_ids = body.userIds;
    payload.include_aliases = { external_id: body.userIds };
    payload.target_channel = "push";
    payload.channel_for_external_user_ids = "push";
  } else if (body.playerIds?.length) {
    payload.include_player_ids = body.playerIds;
  } else {
    return { ok: false, result: { error: "no recipients" }, status: 400 };
  }

  // Retry up to 3 times with backoff
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && !(result as any)?.errors) {
        return { ok: true, result, status: res.status };
      }
      lastErr = result;
      if (res.status < 500) return { ok: false, result, status: res.status };
    } catch (e) { lastErr = (e as Error).message; }
    await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)));
  }
  return { ok: false, result: lastErr, status: 500 };
}

async function fireZapier(channel: ChannelKey, body: Payload, deepLink: string) {
  const hook = getZapierWebhook(channel);
  if (!hook) return null;
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: (body.data as any)?.type ?? "general",
        channel,
        title: body.title,
        body: body.message,
        message: body.message,
        preview: body.preview ?? body.message,
        url: deepLink,
        thread_url: deepLink,
        sender_id: body.sender_id ?? (body.data as any)?.sender_id ?? null,
        sender_name: body.sender_name ?? (body.data as any)?.sender_name ?? null,
        broadcast: !!body.broadcast,
        userIds: body.userIds ?? [],
        data: body.data ?? {},
        sent_at: new Date().toISOString(),
      }),
    });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, ok: false, error: (e as Error).message };
  }
}

async function logDispatch(row: Record<string, unknown>) {
  try { await admin.from("notification_dispatch_logs").insert(row); }
  catch (e) { console.error("[dispatch] log threw", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Payload | null = null;
  try {
    body = (await req.json()) as Payload;
    if (!body?.title || !body?.message) {
      return new Response(JSON.stringify({ error: "title and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dedupeId = body.dedupe_id ?? ((body.data as any)?.dedupe_id ?? null);
    const deepLink = absoluteUrl(body.url ?? (body.data as any)?.url ?? (body.data as any)?.thread_url);
    const channel = pickChannel(body.data);

    const target_type = body.broadcast ? "broadcast"
      : body.userIds?.length ? "external_user_ids"
      : body.playerIds?.length ? "player_ids" : "none";
    const target_value = body.broadcast ? ["Subscribed Users"] : body.userIds ?? body.playerIds ?? null;

    // Fire push + zapier in parallel
    const [oneSignal, zapier] = await Promise.all([
      callOneSignal(body, dedupeId, deepLink),
      fireZapier(channel, body, deepLink),
    ]);

    await logDispatch({
      title: body.title, body: body.message, target_type, target_value,
      user_ids: body.userIds ?? null,
      recipients: (oneSignal.result as any)?.recipients ?? null,
      onesignal_id: (oneSignal.result as any)?.id ?? null,
      status: oneSignal.ok ? "sent" : "failed",
      channel,
      error: oneSignal.ok ? null : JSON.stringify(oneSignal.result).slice(0, 500),
      raw_response: { onesignal: oneSignal.result, zapier },
      request_payload: { ...body, dedupe_id: dedupeId, deepLink } as unknown as Record<string, unknown>,
    });

    return new Response(JSON.stringify({
      ok: oneSignal.ok, channel, onesignal: oneSignal.result, zapier,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await logDispatch({
      title: body?.title ?? null, body: body?.message ?? null,
      status: "exception", error: (e as Error).message,
      request_payload: (body ?? {}) as unknown as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
