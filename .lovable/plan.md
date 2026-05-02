# Plan: Fix OneSignal init conflict, then run full end-to-end test

## Why the OneSignal popup isn't working

There are **two competing OneSignal initializations** in the app:

1. `index.html` — hard-codes `appId: "53f48063-..."`, sets `notifyButton.enable: true`, and loads the SDK script with `defer`.
2. `src/lib/onesignal.ts` (called from `AuthContext`) — fetches the App ID from the `get-onesignal-config` edge function, **injects the SDK script a second time**, and calls `OneSignal.init(...)` again with `notifyButton.enable: false`.

Calling `OneSignal.init` twice causes the v16 SDK to throw / no-op silently, the bell never appears, `User.PushSubscription.id` stays null, and `linkUserToPush` never registers a player id — which is exactly what the edge function logs show:
```
OneSignal OK { id: "", errors: [ "All included players are not subscribed" ] }
```

Additionally, the console line you pasted is the SDK's normal browser-compat probe — but in the **Lovable preview iframe**, service workers from a different origin are blocked, so subscription cannot complete there. Push must be tested on the **published URL** (`https://nsp-app.lovable.app`), not the `id-preview--…` iframe.

## Fixes

### 1. Single source of truth for OneSignal init
- **Remove** the inline `<script>` block in `index.html` that calls `OneSignal.init` (keep nothing OneSignal-related in `index.html`).
- Keep `src/lib/onesignal.ts` as the only initializer. It already:
  - fetches App ID from the edge function,
  - injects the SDK once (guarded by `#onesignal-sdk` id),
  - calls `OneSignal.init` once,
  - flips `notifyButton.enable` — change this to `true` so the bell appears for testing.
- Add `serviceWorkerPath` / `serviceWorkerUpdaterPath` to the JS init (they currently only exist in the deleted inline block).

### 2. Make `linkUserToPush` actually wait for subscription
After `OneSignal.login(userId)`, also call `OneSignal.User.PushSubscription.optIn()` if `permission === 'granted'`, and subscribe to `change` events on `OneSignal.User.PushSubscription` to upsert the player id when it eventually arrives (instead of only polling 12×500ms once).

### 3. Mark `posts` realtime + ensure inbox counter updates
Verify `notifications` table is in `supabase_realtime` publication (the SettingsPage inbox subscribes via `postgres_changes`). If missing, add it via migration.

## End-to-end test (requires default mode + browser tool)

I'll run this after the fixes:

1. **Admin flow** (your current account):
   - Open `/profile` → Attendance → create session "E2E Test" for today.
   - Confirm row appears in `attendance_sessions`; confirm broadcast push fired (edge function log + a row in `notifications` for every profile).
2. **User flow**:
   - You'll need to log into a second test account in another browser/incognito; I'll prompt you for credentials or use an existing one you point me to (I can't create auth users from chat).
   - Mark attendance on the session.
   - Confirm row in `attendance_records` (status pending) and that admin received a "🙋 marked attendance" push + inbox entry.
3. **Approve**:
   - Back as admin, approve the record.
   - Confirm user got "✅ Attendance approved" push + inbox row + counter increment in real time.
4. **Two-way chat**:
   - Open `/chat/<userId>` and send a message in each direction.
   - Confirm `direct_messages` rows, `messages_push_notify` trigger fires `invoke_push_to_user` only for the recipient, inbox badge updates live.
5. **Push delivery**:
   - On the **published URL**, use the bug panel ("Test admin-post push", "Test message (self)") and confirm native OS notification.

## Technical change list

- `index.html`: remove the inline OneSignal `<script>` block.
- `src/lib/onesignal.ts`: add `serviceWorkerPath`/`Updater` paths to `init`, set `notifyButton.enable: true`, add a `PushSubscription.addEventListener('change', ...)` that upserts to `user_push_subscriptions` whenever the id changes.
- Possibly a small migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications, public.direct_messages, public.attendance_records, public.attendance_sessions;` (idempotency-guarded).
- No edge function changes needed — `send-notification` is correct; the failures were caused by missing player ids.

## What I need from you to finish the E2E test

A second logged-in test user (email or "use account X you can see in DB"). Without it I can only verify the admin half end-to-end.