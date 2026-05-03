// OneSignal Web SDK loader + helpers.
// Uses the v16 SDK loaded from CDN. Safe to call multiple times.
// Production origin: https://nsp-main-app.vercel.app

import { supabase } from "@/integrations/supabase/client";

type OneSignalDeferredItem = (OneSignal: any) => void | Promise<void>;
declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredItem[];
    OneSignal?: any;
    __oneSignalLoaded?: boolean;
    __oneSignalAppId?: string;
  }
}

let initPromise: Promise<void> | null = null;
const log = (...args: any[]) => console.log("[OneSignal]", ...args);
const warn = (...args: any[]) => console.warn("[OneSignal]", ...args);

const fetchAppId = async (): Promise<string | null> => {
  if (window.__oneSignalAppId) return window.__oneSignalAppId;
  try {
    const { data, error } = await supabase.functions.invoke("get-onesignal-config");
    if (error) throw error;
    if (data?.appId) {
      window.__oneSignalAppId = data.appId;
      return data.appId;
    }
  } catch (e) {
    warn("could not load app id from edge function", e);
  }
  return null;
};

const injectScript = () =>
  new Promise<void>((resolve, reject) => {
    if (document.getElementById("onesignal-sdk")) return resolve();
    const s = document.createElement("script");
    s.id = "onesignal-sdk";
    s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load OneSignal SDK (network blocked or offline)"));
    document.head.appendChild(s);
  });

const upsertSubscription = async (userId: string, playerId: string) => {
  try {
    const { error } = await supabase
      .from("user_push_subscriptions")
      .upsert(
        { user_id: userId, player_id: playerId, platform: "web", updated_at: new Date().toISOString() },
        { onConflict: "user_id,player_id" },
      );
    if (error) warn("upsert subscription failed", error);
    else log("subscription stored", { userId, playerId });
  } catch (e) {
    warn("upsert subscription threw", e);
  }
};

export const initOneSignal = async (): Promise<void> => {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const appId = await fetchAppId();
    if (!appId) {
      warn("No app id available, skipping init");
      return;
    }
    try {
      await injectScript();
    } catch (e) {
      warn(e);
      return;
    }
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    await new Promise<void>((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
            serviceWorkerParam: { scope: "/" },
            welcomeNotification: { disable: true },
            notifyButton: { enable: false },
          });
          window.__oneSignalLoaded = true;
          log("init complete", {
            permission: OneSignal?.Notifications?.permission,
            playerId: OneSignal?.User?.PushSubscription?.id ?? null,
            externalId: OneSignal?.User?.externalId ?? null,
          });

          // Auto-upsert player id whenever subscription changes
          try {
            OneSignal.User.PushSubscription.addEventListener("change", async (ev: any) => {
              const id = ev?.current?.id ?? OneSignal?.User?.PushSubscription?.id ?? null;
              const ext = OneSignal?.User?.externalId ?? null;
              log("subscription change", { id, ext });
              if (id && ext) await upsertSubscription(ext, id);
            });
          } catch (e) {
            warn("attach change listener failed", e);
          }
        } catch (e) {
          warn("init error", e);
        } finally {
          resolve();
        }
      });
    });
  })();
  return initPromise;
};

export const requestPushPermission = async (): Promise<boolean> => {
  await initOneSignal();
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        const granted = await OneSignal.Notifications.requestPermission();
        log("permission requested →", granted);
        resolve(!!granted);
      } catch (e) {
        warn("permission request failed", e);
        resolve(false);
      }
    });
  });
};

export const getPlayerId = async (): Promise<string | null> => {
  await initOneSignal();
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        const id = OneSignal?.User?.PushSubscription?.id ?? null;
        resolve(id);
      } catch {
        resolve(null);
      }
    });
  });
};

export const linkUserToPush = async (userId: string, email?: string | null) => {
  await initOneSignal();
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.login(userId);
      log("login(external_id)", userId);
      if (email) await OneSignal.User.addEmail(email).catch(() => {});

      // Wait briefly for the subscription id to be assigned
      let attempts = 0;
      let playerId: string | null = null;
      while (attempts < 20 && !playerId) {
        playerId = OneSignal?.User?.PushSubscription?.id ?? null;
        if (!playerId) {
          await new Promise((r) => setTimeout(r, 500));
          attempts++;
        }
      }

      if (playerId) {
        await upsertSubscription(userId, playerId);
      } else {
        warn("no playerId yet after login (user may not have granted permission)");
      }
    } catch (e) {
      warn("linkUserToPush failed", e);
    }
  });
};

export const logoutOneSignal = async () => {
  if (!window.__oneSignalLoaded) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try { await OneSignal.logout(); log("logout"); } catch {}
  });
};
