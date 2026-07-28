/**
 * Native notification service for Capacitor + OneSignal (Android).
 * Safe to import on web — every native call is guarded by Capacitor.isNativePlatform().
 * On the web we keep the existing VAPID web-push path (see src/lib/webpush.ts).
 */
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/integrations/supabase/client';

// OneSignal App ID is a public identifier. We fetch it from the backend at boot
// so the value stays configurable server-side (secret: ONESIGNAL_APP_ID).
let ONESIGNAL_APP_ID: string | null = null;

async function fetchOneSignalAppId(): Promise<string | null> {
  if (ONESIGNAL_APP_ID) return ONESIGNAL_APP_ID;
  try {
    const { data, error } = await supabase.functions.invoke('get-onesignal-config');
    if (!error && data?.appId) { ONESIGNAL_APP_ID = data.appId as string; return ONESIGNAL_APP_ID; }
  } catch (e) { console.warn('[notif] cannot fetch OneSignal app id', e); }
  return null;
}

type NavHandler = (path: string) => void;

let initialized = false;
let currentUserId: string | null = null;
let navHandler: NavHandler | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const isNative = () => Capacitor.isNativePlatform();

const OneSignal = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).plugins?.OneSignal ?? (window as any).OneSignal ?? null;
};

/** Payload shape agreed with backend for deep-link routing. */
interface OSPayload {
  type?: string;
  route?: string;
  chat_user_id?: string;
  post_id?: string;
  [k: string]: unknown;
}

const routeForPayload = (p: OSPayload | undefined | null): string => {
  if (!p) return '/inbox';
  if (p.route && typeof p.route === 'string') return p.route;
  const postId = (p as any).post_id as string | undefined;
  const peerId = (p as any).sender_id ?? (p as any).caller_id ?? p.chat_user_id;
  switch (p.type) {
    case 'chat':
    case 'message':
    case 'call':
      return peerId ? `/chat/${peerId}` : '/chats';
    case 'prayer':
    case 'prayer_interaction': return '/prayer';
    case 'gallery':             return '/gallery';
    case 'post':
    case 'post_like':
    case 'post_comment':
    case 'repost':
    case 'mention':
    case 'reply':
    case 'image':
    case 'video':
    case 'voice':
    case 'youtube':
    case 'live':
    case 'announcement':        return postId ? `/?post=${postId}` : '/';
    case 'follow':              return (p as any).follower_id ? `/u/${(p as any).follower_id}` : '/inbox';
    case 'community':
    case 'community_invite':    return '/inbox';
    case 'admin':               return '/inbox';
    case 'result':              return '/inbox';
    case 'assignment':          return '/inbox';
    case 'attendance_session':
    case 'attendance_review':
    case 'attendance_pending':  return '/profile?tab=attendance';
    case 'payment':             return '/settings';
    case 'course':              return '/';
    case 'profile':             return (p as any).user_id ? `/u/${(p as any).user_id}` : '/profile';
    case 'support':             return '/settings';
    default:                    return '/inbox';
  }
};


const ANDROID_CHANNELS = [
  { id: 'general',     name: 'General',     description: 'General notifications',        importance: 4, sound: 'default', vibration: true, lights: true, visibility: 1 },
  { id: 'messages',    name: 'Messages',    description: 'Direct messages and chats',    importance: 5, sound: 'default', vibration: true, lights: true, visibility: 1 },
  { id: 'assignments', name: 'Assignments', description: 'Assignment updates',           importance: 4, sound: 'default', vibration: true, lights: true, visibility: 1 },
  { id: 'results',     name: 'Results',     description: 'Result releases',              importance: 5, sound: 'default', vibration: true, lights: true, visibility: 1 },
  { id: 'exams',       name: 'Exams',       description: 'Exam schedule and reminders',  importance: 5, sound: 'default', vibration: true, lights: true, visibility: 1 },
  { id: 'marketing',   name: 'Marketing',   description: 'Promos and announcements',     importance: 3, sound: null,      vibration: false, lights: false, visibility: 1 },
  { id: 'critical',    name: 'Critical',    description: 'Urgent alerts',                importance: 5, sound: 'default', vibration: true, lights: true, visibility: 1 },
];

async function registerAndroidChannels() {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({ id: 'general', name: 'General', importance: 4, visibility: 1 });
    for (const ch of ANDROID_CHANNELS) {
      await LocalNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        importance: ch.importance as 1 | 2 | 3 | 4 | 5,
        visibility: ch.visibility as -1 | 0 | 1,
        vibration: ch.vibration,
        lights: ch.lights,
        sound: ch.sound ?? undefined,
      });
    }
  } catch (e) {
    console.warn('[notif] channel setup failed', e);
  }
}

async function sendDeviceMetaToBackend(userId: string, oneSignalId: string | null) {
  try {
    const info = await Device.getInfo(); const appInfo = await CapApp.getInfo().catch(() => ({ version: null as string | null }));
    const id = await Device.getId();
    const lang = await Device.getLanguageCode();
    const payload = {
      user_id: userId,
      onesignal_id: oneSignalId,
      platform: 'android',
      os_version: info.osVersion,
      app_version: appInfo.version ?? null,
      device_model: info.model,
      device_id: id.identifier,
      permission_granted: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: lang.value,
      last_sync: new Date().toISOString(),
    };
    // Store as a native push subscription row (endpoint = onesignal:<id>).
    await supabase.from('user_push_subscriptions').upsert({
      user_id: userId,
      endpoint: oneSignalId ? `onesignal:${oneSignalId}` : `device:${id.identifier}`,
      player_id: oneSignalId,
      p256dh: '',
      auth: '',
      user_agent: `capacitor-android/${appInfo.version ?? '1.0'} ${info.model}`,
      platform: 'android-native',
      last_seen_at: payload.last_sync,
    } as never, { onConflict: 'endpoint' } as never);
    localStorage.setItem('nsp_native_last_sync', payload.last_sync);
  } catch (e) {
    console.warn('[notif] backend sync failed, will retry', e);
    scheduleRetry(() => sendDeviceMetaToBackend(userId, oneSignalId));
  }
}

function scheduleRetry(fn: () => void, delay = 15000) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(fn, delay);
}

/** One-time SDK bootstrap. Call from usePushNotifications on mount. */
export async function initializeNotifications(handler?: NavHandler) {
  if (handler) navHandler = handler;
  if (!isNative() || initialized) return;

  const os = OneSignal();
  if (!os) {
    console.warn('[notif] OneSignal plugin not present at runtime');
    return;
  }

  try {
    os.Debug?.setLogLevel?.(6);
    const appId = await fetchOneSignalAppId();
    if (!appId) { console.warn('[notif] no OneSignal app id available; aborting init'); return; }
    os.initialize(appId);

    // Foreground listener — deliver payload to in-app banner and local storage.
    os.Notifications.addEventListener('foregroundWillDisplay', (event: any) => {
      try {
        const n = event?.getNotification?.() ?? event?.notification;
        // Let OneSignal display the native notification too.
        event.preventDefault?.();
        event.notification?.display?.();
        storeLocalNotification(n);
      } catch (e) { console.warn('[notif] foreground handler failed', e); }
    });

    // Notification tapped / opened.
    os.Notifications.addEventListener('click', (event: any) => {
      try {
        const data = event?.notification?.additionalData ?? event?.result?.notification?.additionalData ?? {};
        const path = routeForPayload(data);
        navHandler?.(path);
      } catch (e) { console.warn('[notif] click handler failed', e); }
    });

    os.Notifications.addEventListener('permissionChange', () => {
      // Nothing to do — hook re-reads state.
    });

    os.User.pushSubscription.addEventListener?.('change', (_ev: any) => {
      if (currentUserId) syncTokenSoon(currentUserId);
    });

    await registerAndroidChannels();

    // Ask for permission (Android 13+).
    try {
      await os.Notifications.requestPermission(true);
    } catch (e) {
      console.warn('[notif] permission request failed', e);
    }

    // Recover after resume / connectivity restored.
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && currentUserId) syncTokenSoon(currentUserId);
    });
    Network.addListener('networkStatusChange', (s) => {
      if (s.connected && currentUserId) syncTokenSoon(currentUserId);
    });

    initialized = true;
  } catch (e) {
    console.error('[notif] init failed', e);
    scheduleRetry(() => { initialized = false; initializeNotifications(); });
  }
}

function syncTokenSoon(userId: string) { setTimeout(() => sendTokenToServer(userId), 500); }

export async function requestPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try { return !!(await OneSignal()?.Notifications.requestPermission(true)); }
  catch { return false; }
}

/** Associate current user with OneSignal (call after Supabase sign-in). */
export async function login(userId: string) {
  currentUserId = userId;
  if (!isNative()) return;
  const os = OneSignal(); if (!os) return;
  try {
    await os.login(userId);
    await sendTokenToServer(userId);
  } catch (e) {
    console.warn('[notif] login failed', e);
    scheduleRetry(() => login(userId));
  }
}

/** Break the link (call before Supabase sign-out). */
export async function logout() {
  const os = OneSignal();
  const prev = currentUserId;
  currentUserId = null;
  if (!isNative() || !os) return;
  try {
    if (prev) {
      await supabase.from('user_push_subscriptions')
        .delete()
        .eq('user_id', prev)
        .eq('platform', 'android-native');
    }
    await os.logout();
  } catch (e) { console.warn('[notif] logout failed', e); }
}

export async function subscribe() {
  const os = OneSignal(); if (!isNative() || !os) return;
  try { await os.User.pushSubscription.optIn(); } catch (e) { console.warn(e); }
}

export async function unsubscribe() {
  const os = OneSignal(); if (!isNative() || !os) return;
  try { await os.User.pushSubscription.optOut(); } catch (e) { console.warn(e); }
}

export async function getDeviceState() {
  if (!isNative()) return { native: false as const };
  const os = OneSignal();
  const info = await Device.getInfo(); const appInfo = await CapApp.getInfo().catch(() => ({ version: null as string | null }));
  const id = await Device.getId();
  let oneSignalId: string | null = null;
  let pushToken: string | null = null;
  let optedIn = false;
  let permission = false;
  try {
    oneSignalId = (await os?.User?.getOnesignalId?.()) ?? null;
    pushToken = (await os?.User?.pushSubscription?.getTokenAsync?.()) ?? null;
    optedIn = !!(await os?.User?.pushSubscription?.getOptedInAsync?.());
    permission = !!(await os?.Notifications?.getPermissionAsync?.());
  } catch { /* noop */ }
  return {
    native: true as const,
    platform: info.platform,
    osVersion: info.osVersion,
    model: info.model,
    deviceId: id.identifier,
    appVersion: appInfo.version,
    oneSignalId,
    pushToken,
    optedIn,
    permission,
    lastSync: localStorage.getItem('nsp_native_last_sync'),
  };
}

export async function sendTokenToServer(userId: string) {
  if (!isNative()) return;
  const os = OneSignal(); if (!os) return;
  try {
    const oneSignalId = (await os.User.getOnesignalId?.()) ?? null;
    const net = await Network.getStatus();
    if (!net.connected) { scheduleRetry(() => sendTokenToServer(userId)); return; }
    await sendDeviceMetaToBackend(userId, oneSignalId);
  } catch (e) {
    console.warn('[notif] token upload failed', e);
    scheduleRetry(() => sendTokenToServer(userId));
  }
}

export function setNavHandler(fn: NavHandler) { navHandler = fn; }

/** Local persistence of the last N notifications (offline log). */
const LOCAL_KEY = 'nsp_native_notifications_v1';
function storeLocalNotification(n: any) {
  try {
    const entry = {
      id: n?.notificationId ?? n?.id ?? String(Date.now()),
      title: n?.title ?? '',
      body: n?.body ?? '',
      image: n?.bigPicture ?? n?.largeIcon ?? null,
      time: new Date().toISOString(),
      read: false,
      payload: n?.additionalData ?? {},
      category: n?.additionalData?.type ?? 'general',
    };
    const raw = localStorage.getItem(LOCAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    localStorage.setItem(LOCAL_KEY, JSON.stringify([entry, ...arr].slice(0, 100)));
  } catch { /* ignore */ }
}

export function getLocalNotifications() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'); } catch { return []; }
}

export function isNativeApp() { return isNative(); }
