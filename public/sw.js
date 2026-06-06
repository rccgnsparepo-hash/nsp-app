// Native Web Push service worker (VAPID).
// Handles `push` and `notificationclick`. Does NOT cache app shell.
// Safe to host at /sw.js because we never call event.respondWith on fetch.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Dedupe identical pushes that arrive within a short window (e.g. duplicate
// dispatches or retries). Keyed by dedupe_id (tag).
const RECENT = new Map(); // tag -> timestamp
const DEDUPE_WINDOW_MS = 30 * 1000;

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {
    try { payload = { title: 'Notification', body: event.data?.text() ?? '' }; } catch {}
  }

  const {
    title = 'New notification',
    body = '',
    url = '/inbox',
    tag,
    icon = '/favicon.ico',
    badge = '/favicon.ico',
    image,
    data = {},
    actions,
    silent,
    renotify,
  } = payload;

  // Dedupe by tag (dedupe_id) within the window
  if (tag) {
    const now = Date.now();
    const last = RECENT.get(tag);
    if (last && now - last < DEDUPE_WINDOW_MS) {
      event.waitUntil(Promise.resolve());
      return;
    }
    RECENT.set(tag, now);
    // Garbage-collect old entries
    if (RECENT.size > 200) {
      for (const [k, t] of RECENT) if (now - t > DEDUPE_WINDOW_MS) RECENT.delete(k);
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || undefined,
      renotify: !!renotify,
      icon,
      badge,
      image,
      silent: !!silent,
      data: { url, ...data },
      actions: Array.isArray(actions) ? actions : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/inbox';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Try to focus an existing window on same origin
    for (const client of all) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          // Tell the page to route in-app without full reload
          client.postMessage({ type: 'push:navigate', url: targetUrl });
          return;
        }
      } catch {}
    }
    // No window open — open a new one
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Browser rotated the subscription. The page will re-subscribe on next load
  // via ensurePushSubscription(); nothing to do here.
});
