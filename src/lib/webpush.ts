// Native Web Push (VAPID) helpers — replaces OneSignal SDK.
// Public VAPID key is safe to embed in client code.

import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY =
  "BE_pwejN505979cBfzzCUpNq-YNlsBjdq5ClCFjLj9F2n5sIH405Kxfuz6p_xi3b6Ihr_UF8h5yoY64hPBIFVMk";

const SW_PATH = "/sw.js";

const log = (...a: any[]) => console.log("[webpush]", ...a);
const warn = (...a: any[]) => console.warn("[webpush]", ...a);

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const currentPermission = (): NotificationPermission | "unsupported" =>
  isPushSupported() ? Notification.permission : "unsupported";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer | null) {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
export const registerServiceWorker = async () => {
  if (!isPushSupported()) return null;
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      await navigator.serviceWorker.ready;
      log("sw registered");
      return reg;
    } catch (e) {
      warn("sw register failed", e);
      return null;
    }
  })();
  return registrationPromise;
};

const persistSubscription = async (userId: string, sub: PushSubscription) => {
  const json = sub.toJSON() as any;
  const endpoint = json.endpoint as string;
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));
  const expiration_time = (sub as any).expirationTime ?? null;

  const { error } = await supabase
    .from("user_push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        expiration_time,
        platform: "web",
        user_agent: navigator.userAgent.slice(0, 500),
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
        failure_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (error) warn("persist failed", error);
  else log("subscription stored");
};

export const ensurePushSubscription = async (userId: string): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  if (Notification.permission !== "granted") return null;
  const reg = await registerServiceWorker();
  if (!reg) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      log("created push subscription");
    } catch (e) {
      warn("subscribe failed", e);
      return null;
    }
  }
  await persistSubscription(userId, sub);
  return sub;
};

export const requestPushPermission = async (userId: string): Promise<boolean> => {
  if (!isPushSupported()) return false;
  let perm: NotificationPermission = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  await ensurePushSubscription(userId);
  return true;
};

export const unsubscribePush = async (userId: string) => {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch {}
    await supabase
      .from("user_push_subscriptions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
  }
};

// Listen for clicks on a push notification (sent from the SW) and route in-app
export const installPushNavListener = () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "push:navigate") return;
    const url: string = data.url || "/inbox";
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin === window.location.origin) {
        window.history.pushState({}, "", u.pathname + u.search + u.hash);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else {
        window.location.href = url;
      }
    } catch {
      window.location.href = url;
    }
  });
};
