// Edge function: dispatch-notification
// Native VAPID Web Push — replaces OneSignal entirely while preserving the
// existing Zapier channel webhooks for downstream automations.
//
// - Looks up active push subscriptions for target users (or all if broadcast)
// - Sends encrypted Web Push notifications via the `web-push` library
// - Marks failed subscriptions (410/404) as revoked
// - Logs every dispatch to notification_dispatch_logs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface Payload {
  broadcast?: boolean;
  userIds?: string[];
  title: string;
  message: string;
  data?: Record<string, unknown>;
  url?: string;
  dedupe_id?: string | null;
  group_key?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  preview?: string | null;
  icon?: string | null;
  image?: string | null;
  // Backwards-compat (ignored)
  playerIds?: string[];
  target_mode?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRODUCTION_ORIGIN = "https://nsp-app.lovable.app";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { console.error("[dispatch] setVapidDetails failed", e); }
}

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

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; platform: string | null; player_id: string | null };

async function loadSubscriptions(broadcast: boolean, userIds?: string[]): Promise<SubRow[]> {
  let q = admin
    .from("user_push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,platform,player_id")
    .is("revoked_at", null)
    .not("endpoint", "is", null);

  if (!broadcast && userIds && userIds.length > 0) {
    q = q.in("user_id", userIds);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[dispatch] load subs failed", error);
    return [];
  }
  return (data ?? []) as SubRow[];
}

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

async function sendOneSignalNative(userIds: string[], body: Payload, deepLink: string, dedupeId: string | null) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || userIds.length === 0) {
    return { ok: false, skipped: true, reason: "no_keys_or_users" };
  }
  const payload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: userIds },
    target_channel: "push",
    headings: { en: body.title },
    contents: { en: body.message },
    android_channel_id: undefined,
    data: { ...(body.data ?? {}), url: deepLink, dedupe_id: dedupeId },
    url: deepLink,
    collapse_id: dedupeId ?? undefined,
    big_picture: body.image ?? undefined,
  };
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, response: json };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

async function sendOne(sub: SubRow, payloadJSON: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payloadJSON,
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true, status: (res as any)?.statusCode ?? 201 };
  } catch (e: any) {
    const status = e?.statusCode ?? 0;
    return { ok: false, status, error: e?.body ?? e?.message ?? String(e) };
  }
}

async function markRevoked(ids: string[]) {
  if (!ids.length) return;
  await admin
    .from("user_push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .in("id", ids);
}

async function incrementFailures(ids: string[]) {
  if (!ids.length) return;
  // Best-effort bump; ignore errors
  for (const id of ids) {
    await admin.rpc("noop").catch(() => {});
    await admin
      .from("user_push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", id)
      .catch?.(() => {});
  }
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

  // Simple status probe for the admin diagnostics card.
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("status")) {
    return new Response(JSON.stringify({
      chat_configured: !!Deno.env.get("ZAPIER_WEBHOOK_CHAT"),
      gallery_post_configured: !!Deno.env.get("ZAPIER_WEBHOOK_GALLERY_POST"),
      voice_note_configured: !!Deno.env.get("ZAPIER_WEBHOOK_VOICE_NOTE"),
      youtube_post_configured: !!Deno.env.get("ZAPIER_WEBHOOK_YOUTUBE_POST"),
      prayer_configured: !!Deno.env.get("ZAPIER_WEBHOOK_PRAYER"),
      attendance_configured: !!Deno.env.get("ZAPIER_WEBHOOK_ATTENDANCE"),
      vapid_configured: !!(VAPID_PUBLIC && VAPID_PRIVATE),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: Payload | null = null;
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      : body.userIds?.length ? "external_user_ids" : "none";
    const target_value = body.broadcast ? ["broadcast"] : body.userIds ?? null;

    // Build the push payload the service worker receives
    const pushPayload = {
      title: body.title,
      body: body.message,
      url: deepLink,
      tag: dedupeId ?? undefined,
      icon: body.icon ?? "/favicon.ico",
      badge: "/favicon.ico",
      image: body.image ?? undefined,
      renotify: true,
      data: {
        ...(body.data ?? {}),
        dedupe_id: dedupeId,
        group_key: body.group_key ?? null,
      },
    };
    const payloadJSON = JSON.stringify(pushPayload);

    // Load matching subscriptions
    const subs = await loadSubscriptions(!!body.broadcast, body.userIds);

    // Send to all subs in parallel
    const results = await Promise.all(subs.map((s) => sendOne(s, payloadJSON)));
    const sent = results.filter(r => r.ok).length;
    const revokedIds: string[] = [];
    const failedIds: string[] = [];
    results.forEach((r, i) => {
      if (!r.ok) {
        if (r.status === 404 || r.status === 410) revokedIds.push(subs[i].id);
        else failedIds.push(subs[i].id);
      }
    });
    if (revokedIds.length) await markRevoked(revokedIds);

    // Fire Zapier in parallel (don't block on push)
    const zapier = await fireZapier(channel, body, deepLink);

    const ok = sent > 0 || subs.length === 0;
    await logDispatch({
      title: body.title, body: body.message, target_type, target_value,
      user_ids: body.userIds ?? null,
      recipients: sent,
      status: subs.length === 0 ? "no_subscribers" : (sent > 0 ? "sent" : "failed"),
      channel,
      error: sent === 0 && subs.length > 0
        ? JSON.stringify(results.slice(0, 5).map(r => ({ s: r.status, e: r.error?.slice(0, 120) }))).slice(0, 500)
        : null,
      raw_response: { sent, total: subs.length, revoked: revokedIds.length, zapier },
      request_payload: { ...body, dedupe_id: dedupeId, deepLink } as unknown as Record<string, unknown>,
    });

    return new Response(JSON.stringify({
      ok, channel, sent, total: subs.length, revoked: revokedIds.length, zapier,
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
