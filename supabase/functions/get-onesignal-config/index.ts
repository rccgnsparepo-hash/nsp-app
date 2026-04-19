// Returns the public OneSignal App ID so the web SDK can init without
// hard-coding it in the bundle. Safe to expose: the App ID is public.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const appId = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
  return new Response(JSON.stringify({ appId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
