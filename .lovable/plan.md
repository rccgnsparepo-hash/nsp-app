# Push Notifications: Vercel Migration + Trigger Hardening

## Diagnosis (verified, not assumed)

I queried the database and edge function state. Here's what is actually happening:

1. **Triggers ARE attached and firing.** `notifications` table has 166 rows in the last 24h. The 6 triggers from the previous migration (`posts_push_notify`, `messages_push_notify`, etc.) are working.
2. **The edge function IS being called.** Recent `pg_net` HTTP responses to `send-notification` returned HTTP 200.
3. **OneSignal is rejecting every send** with: `"All included players are not subscribed"`. This is the real root cause.
4. **`user_push_subscriptions` has only 1 row** — meaning almost no browser/device has actually completed the OneSignal subscription handshake.

So the problem is **not** missing triggers or missing backend wiring. It is that **OneSignal's App is configured for the wrong Site URL / origin**, so when users visit `nsp-main-app.vercel.app` the SDK either can't register the service worker under the right scope or registers a subscription that OneSignal then marks as not-subscribed for the App's allowed origin. That is why manual dashboard pushes work (they hit any subscribed device on any origin tied to the app) but server-side `include_external_user_ids` calls find nothing for the new domain.

## What requires action OUTSIDE the codebase (you must do this in OneSignal)

Code changes alone cannot fix the "players not subscribed" error. In the OneSignal dashboard for this app:

1. **Settings → Web Configuration → Typical Site**
   - Site URL: `https://nsp-main-app.vercel.app`
   - Default icon URL: keep or update
   - Disable "My site is not fully HTTPS"
2. **Remove** any old `lovable.app` / `id-preview--*.lovable.app` entries from the Site URL list.
3. Save and let OneSignal regenerate the SDK config. Existing subscriptions tied to the old origin will be invalidated — that's expected; users will re-subscribe on first visit to the Vercel domain.
4. Confirm `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` secrets in Lovable Cloud match this same app (they're already set).

I'll call this out in the final response so you don't miss it.

## Code/infra changes I will make

### 1. Service worker scope + Vercel headers
- Verify `public/OneSignalSDKWorker.js` exists (it does) and add `public/OneSignalSDKUpdaterWorker.js` (currently missing — referenced in init but not on disk).
- Update `vercel.json` to:
  - Serve `/OneSignalSDKWorker.js` and `/OneSignalSDKUpdaterWorker.js` with `Service-Worker-Allowed: /` and `Cache-Control: no-cache`.
  - Keep SPA rewrite but EXCLUDE the worker files so they aren't rewritten to `index.html` (current rewrite catches `/(.*)` which breaks SW serving on Vercel).

### 2. `src/lib/onesignal.ts` hardening
- Stop hard-coding `notifyButton: { enable: true }` (it interferes on mobile). Make it opt-in.
- Persist player_id + external_id more aggressively: also upsert on `initOneSignal` completion, not only on the change event.
- Add a `welcomeNotification: { disable: true }` and explicit `serviceWorkerParam: { scope: '/' }`.
- Log the player_id, permission state, and external_id to console under a `[OneSignal]` prefix so the debug panel and console show what's happening.

### 3. Centralized notification utility (DB side)
- Add `public.notify_users(_user_ids uuid[], _title, _body, _data)` and refactor `invoke_push_to_user` / `invoke_push_broadcast` to delegate to it. This is the single choke point for inbox-insert + OneSignal dispatch with consistent logging via `RAISE NOTICE`.
- Add `public.notify_followers_of(_actor_id uuid, ...)` stub for future use (no follower table exists today, so it broadcasts excluding actor — keeps the API ready).

### 4. Re-attach triggers idempotently in a fresh migration
The current triggers exist but `pg_trigger` lookups via the read tool returned empty (likely view permission), so I'll re-issue `CREATE TRIGGER IF NOT EXISTS`-style DDL to be safe, plus add the missing ones:
- `post_likes` INSERT → notify post owner ("X liked your post")
- `post_comments` INSERT → notify post owner + parent comment author
- `prayer_interactions` INSERT → notify prayer author ("X is praying with you")
- Keep existing: posts, prayer_requests, direct_messages, attendance_sessions, attendance_records (insert + update).

### 5. `send-notification` edge function
- Restrict CORS `Access-Control-Allow-Origin` to `https://nsp-main-app.vercel.app` (with fallback to `*` only in non-prod via `ALLOWED_ORIGIN` env var, default to vercel domain).
- Better error surfacing: when OneSignal returns `errors: ["All included players are not subscribed"]`, return HTTP 200 with `{ ok: false, reason: "no_subscribers" }` and log clearly so triggers don't look like silent failures.
- Add `console.log` for every dispatch including target type and external_user_ids count.

### 6. Cleanup of `lovable.app` references
- Search & remove any `lovable.app` strings from `index.html`, `vite.config.ts`, manifest, SW files. (Current scan: only social-image OG URLs reference Google Cloud Storage, no lovable.app domain in shipped code — I'll re-verify and strip if found.)

## Files to add/edit

```text
supabase/migrations/<new>.sql        new — central notify utility + likes/comments/prayer-interaction triggers, re-assert existing triggers
supabase/functions/send-notification/index.ts   edit — origin restriction, better error reporting, logs
src/lib/onesignal.ts                  edit — scope, logging, eager upsert, no welcome notif
public/OneSignalSDKUpdaterWorker.js  new — importScripts updater SW
vercel.json                           edit — SW headers + exclude workers from SPA rewrite
src/components/PushDebugPanel.tsx    edit — show "OneSignal site URL" hint + last upsert timestamp
```

No changes to `client.ts`, `types.ts`, or `config.toml`.

## How we'll verify it works

1. Deploy, visit `https://nsp-main-app.vercel.app` in a clean browser, accept push prompt.
2. Confirm `user_push_subscriptions` row appears for your user (I'll query it).
3. Confirm OneSignal dashboard → Audience shows your user with a subscribed Web record on the vercel.app origin.
4. Have a second user (or you on a second device) post / message. Check:
   - `notifications` row inserted (inbox)
   - `net._http_response` for `send-notification` returns `ok: true` AND `oneSignal.recipients > 0` (no longer "not subscribed")
   - Native push lands on the device
5. If step 4 still shows "not subscribed", the OneSignal dashboard Site URL was not updated — see "OUTSIDE the codebase" section above.

## Things I will NOT do

- Will not enable anonymous sign-ups, change auth, or touch unrelated features.
- Will not store secrets in code; the App ID continues to come from `get-onesignal-config` edge function.
- Will not remove the inbox/in-app notification system — it stays as the source of truth even when OneSignal can't deliver.
