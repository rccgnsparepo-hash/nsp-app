// OneSignal Web SDK loader + helpers.
// Uses the v16 SDK loaded from CDN. Safe to call multiple times.

import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "ENV_INJECTED_APP_ID"; // overridden at runtime via fetch below

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
    console.warn("[OneSignal] could not load app id from edge function", e);
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
    s.onerror = () => reject(new Error("Failed to load OneSignal SDK"));
    document.head.appendChild(s);
  });

export const initOneSignal = async (): Promise<void> => {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const appId = await fetchAppId();
    if (!appId) {
      console.warn("[OneSignal] No app id available, skipping init");
      return;
    }
    await injectScript();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    await new Promise<void>((resolve) => {
      window.OneSignalDeferred!.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
          });
          window.__oneSignalLoaded = true;
        } catch (e) {
          console.warn("[OneSignal] init error", e);
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
        resolve(!!granted);
      } catch {
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
        // v16 exposes the subscription id (player id) via User.PushSubscription.id
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
      if (email) await OneSignal.User.addEmail(email).catch(() => {});

      // Wait briefly for the subscription id to be assigned
      let attempts = 0;
      let playerId: string | null = null;
      while (attempts < 12 && !playerId) {
        playerId = OneSignal?.User?.PushSubscription?.id ?? null;
        if (!playerId) {
          await new Promise((r) => setTimeout(r, 500));
          attempts++;
        }
      }

      if (playerId) {
        await supabase
          .from("user_push_subscriptions")
          .upsert(
            { user_id: userId, player_id: playerId, platform: "web", updated_at: new Date().toISOString() },
            { onConflict: "user_id,player_id" },
          );
      }
    } catch (e) {
      console.warn("[OneSignal] linkUserToPush failed", e);
    }
  });
};

export const logoutOneSignal = async () => {
  if (!window.__oneSignalLoaded) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try { await OneSignal.logout(); } catch {}
  });
};
