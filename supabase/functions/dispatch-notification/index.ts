// Edge function: dispatch-notification
// Routes to one of 6 Zapier webhooks based on payload type.
// Now forwards sender_name, sender_id, preview, thread_url, target_mode, voip as top-level
// fields so Zapier mappings stay simple.

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
  // optional enriched fields from DB triggers
  sender_id?: string | null;
  sender_name?: string | null;
  preview?: string | null;
  target_mode?: "external_user_ids" | "broadcast" | string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  if (type === "post_like" || type === "post_comment") return "chat"; // user-targeted
  if (type === "prayer" || type === "prayer_interaction") return "prayer";
  if (type === "attendance_session" || type === "attendance_review" || type === "attendance_pending") return "attendance";
  if (type === "post") {
    if (postType === "voice") return "voice_note";
    if (postType === "youtube") return "youtube_post";
    return "gallery_post";
  }
  return "fallback";
}

function getWebhookForChannel(ch: ChannelKey): string | null {
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

async function logDispatch(row: Record<string, unknown>) {
  try { await admin.from("notification_dispatch_logs").insert(row); }
  catch (e) { console.error("[dispatch] log threw", e); }
}

async function callFallback(body: Payload): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: res.ok, channel: "onesignal_fallback", data }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("status") === "1") {
    return new Response(JSON.stringify({
      chat_configured: !!Deno.env.get("ZAPIER_WEBHOOK_CHAT"),
      gallery_post_configured: !!Deno.env.get("ZAPIER_WEBHOOK_GALLERY_POST"),
      voice_note_configured: !!Deno.env.get("ZAPIER_WEBHOOK_VOICE_NOTE"),
      youtube_post_configured: !!Deno.env.get("ZAPIER_WEBHOOK_YOUTUBE_POST"),
      prayer_configured: !!Deno.env.get("ZAPIER_WEBHOOK_PRAYER"),
      attendance_configured: !!Deno.env.get("ZAPIER_WEBHOOK_ATTENDANCE"),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: Payload | null = null;
  try {
    body = (await req.json()) as Payload;
    if (!body?.title || !body?.message) {
      return new Response(JSON.stringify({ error: "title and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const channel = pickChannel(body.data);
    const webhook = getWebhookForChannel(channel);

    const target_type = body.broadcast ? "broadcast"
      : body.userIds?.length ? "external_user_ids"
      : body.playerIds?.length ? "player_ids" : "none";
    const target_value = body.broadcast ? ["Subscribed Users"] : body.userIds ?? body.playerIds ?? null;
    const user_ids = body.userIds ?? null;
    const type = (body.data as any)?.type ?? "general";

    if (!webhook) {
      await logDispatch({
        title: body.title, body: body.message, target_type, target_value, user_ids,
        status: "skipped", channel, error: `No webhook for ${channel}`,
        request_payload: body as unknown as Record<string, unknown>,
      });
      return await callFallback(body);
    }

    // Top-level fields make Zapier mapping trivial: {{sender_name}}, {{preview}}, {{userIds}}…
    const zapPayload = {
      type,
      channel,
      title: body.title,
      body: body.message,
      message: body.message,
      preview: body.preview ?? body.message,
      sender_id: body.sender_id ?? (body.data as any)?.sender_id ?? null,
      sender_name: body.sender_name ?? (body.data as any)?.sender_name ?? null,
      thread_url: (body.data as any)?.thread_url ?? body.url ?? null,
      target_mode: body.target_mode ?? (body.broadcast ? "broadcast" : "external_user_ids"),
      voip: !!(body.data as any)?.voip,
      broadcast: !!body.broadcast,
      userIds: body.userIds ?? [],
      playerIds: body.playerIds ?? [],
      data: body.data ?? {},
      url: body.url ?? null,
      source: "nsp-main-app",
      sent_at: new Date().toISOString(),
    };

    let zapStatus = 0; let zapText = "";
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zapPayload),
      });
      zapStatus = res.status;
      zapText = await res.text();
      if (res.ok) {
        await logDispatch({
          title: body.title, body: body.message, target_type, target_value, user_ids,
          status: "sent", channel, recipients: body.broadcast ? null : (user_ids?.length ?? 0),
          raw_response: { status: zapStatus, body: zapText.slice(0, 500) },
          request_payload: zapPayload as unknown as Record<string, unknown>,
        });
        return new Response(JSON.stringify({ ok: true, channel, status: zapStatus }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (e) { zapText = (e as Error).message; }

    await logDispatch({
      title: body.title, body: body.message, target_type, target_value, user_ids,
      status: "zapier_failed", channel,
      error: `Zapier HTTP ${zapStatus}: ${zapText.slice(0, 300)}`,
      request_payload: zapPayload as unknown as Record<string, unknown>,
    });
    return await callFallback(body);
  } catch (e) {
    await logDispatch({
      title: body?.title ?? null, body: body?.message ?? null,
      status: "exception", channel: "unknown", error: (e as Error).message,
      request_payload: (body ?? {}) as unknown as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
