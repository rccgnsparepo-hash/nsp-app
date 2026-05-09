// Edge function: dispatch-notification
// Single choke point for app-triggered pushes.
// Routes to Zapier webhook (which calls OneSignal). Falls back to direct send-notification on failure.

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
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function logDispatch(row: Record<string, unknown>) {
  try {
    const { error } = await admin.from("notification_dispatch_logs").insert(row);
    if (error) console.error("[dispatch-notification] log insert error", error);
  } catch (e) {
    console.error("[dispatch-notification] log threw", e);
  }
}

async function callFallback(body: Payload): Promise<Response> {
  console.log("[dispatch-notification] falling back to send-notification");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: res.ok, channel: "onesignal_fallback", data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ZAPIER_WEBHOOK_URL = Deno.env.get("ZAPIER_WEBHOOK_URL");

  // Status probe for the admin UI
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("status") === "1") {
    return new Response(
      JSON.stringify({ zapier_configured: !!ZAPIER_WEBHOOK_URL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: Payload | null = null;
  try {
    body = (await req.json()) as Payload;
    if (!body?.title || !body?.message) {
      return new Response(
        JSON.stringify({ error: "title and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const target_type = body.broadcast
      ? "broadcast"
      : body.userIds?.length ? "external_user_ids"
      : body.playerIds?.length ? "player_ids"
      : "none";
    const target_value = body.broadcast ? ["Subscribed Users"] : body.userIds ?? body.playerIds ?? null;
    const user_ids = body.userIds ?? null;
    const type = (body.data as any)?.type ?? "general";

    if (!ZAPIER_WEBHOOK_URL) {
      console.warn("[dispatch-notification] no ZAPIER_WEBHOOK_URL set, using fallback");
      await logDispatch({
        title: body.title, body: body.message, target_type, target_value, user_ids,
        status: "skipped", channel: "zapier",
        error: "ZAPIER_WEBHOOK_URL not configured",
        request_payload: body as unknown as Record<string, unknown>,
      });
      return await callFallback(body);
    }

    const zapPayload = {
      type,
      title: body.title,
      body: body.message,
      broadcast: !!body.broadcast,
      userIds: body.userIds ?? [],
      playerIds: body.playerIds ?? [],
      data: body.data ?? {},
      url: body.url ?? null,
      source: "nsp-main-app",
      sent_at: new Date().toISOString(),
    };

    console.log("[dispatch-notification] → Zapier", { type, target_type });

    let zapStatus = 0;
    let zapText = "";
    try {
      const res = await fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zapPayload),
      });
      zapStatus = res.status;
      zapText = await res.text();

      if (res.ok) {
        await logDispatch({
          title: body.title, body: body.message, target_type, target_value, user_ids,
          status: "sent", channel: "zapier",
          recipients: body.broadcast ? null : (user_ids?.length ?? 0),
          raw_response: { status: zapStatus, body: zapText.slice(0, 500) },
          request_payload: zapPayload as unknown as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({ ok: true, channel: "zapier", status: zapStatus }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.warn("[dispatch-notification] Zapier non-2xx", zapStatus, zapText);
    } catch (e) {
      console.error("[dispatch-notification] Zapier threw", e);
      zapText = (e as Error).message;
    }

    // Fall back
    await logDispatch({
      title: body.title, body: body.message, target_type, target_value, user_ids,
      status: "zapier_failed", channel: "zapier",
      error: `Zapier HTTP ${zapStatus}: ${zapText.slice(0, 300)}`,
      request_payload: zapPayload as unknown as Record<string, unknown>,
    });
    return await callFallback(body);
  } catch (e) {
    console.error("[dispatch-notification] exception", e);
    await logDispatch({
      title: body?.title ?? null, body: body?.message ?? null,
      status: "exception", channel: "zapier",
      error: (e as Error).message,
      request_payload: (body ?? {}) as unknown as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
