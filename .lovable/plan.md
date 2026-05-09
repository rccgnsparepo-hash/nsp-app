## Goal

Route all app-triggered notifications through a single Zapier webhook (which then calls OneSignal), while keeping the existing `send-notification` edge function as an automatic fallback if Zapier fails.

## Architecture

```text
DB trigger (post/like/message/etc.)
        │
        ▼
public.invoke_push_to_user / invoke_push_broadcast / notify_users
        │  (still inserts inbox row)
        ▼
edge fn: dispatch-notification  ← NEW single choke point
        │
        ├── 1. POST → Zapier webhook (ZAPIER_WEBHOOK_URL)
        │         payload: { type, title, body, userIds[], data, broadcast }
        │
        └── 2. If Zapier returns non-2xx OR secret missing
              → fall back to existing send-notification (OneSignal direct)
        │
        ▼
   notification_dispatch_logs (channel = 'zapier' | 'onesignal_fallback')
```

The Zap on Zapier's side: Webhook (Catch Hook) → OneSignal "Send Push" action mapped from payload fields.

## Changes

### 1. Secret
- Add `ZAPIER_WEBHOOK_URL` via the secrets tool (user pastes their Catch Hook URL).

### 2. New edge function `dispatch-notification`
- Public (verify_jwt = false) — only callable from inside DB via service role calls (same model as send-notification).
- Accepts the same payload shape as send-notification: `{ broadcast?, userIds?, title, message, data?, url? }`.
- Builds a normalized Zapier payload:
  ```json
  {
    "type": "post_like",
    "title": "...",
    "body": "...",
    "broadcast": false,
    "userIds": ["uuid", "..."],
    "data": { ... },
    "source": "nsp-main-app"
  }
  ```
- POSTs to `ZAPIER_WEBHOOK_URL`. On non-2xx, missing secret, or thrown error → invokes `send-notification` as fallback.
- Logs every attempt to `notification_dispatch_logs` with a new `channel` column (`zapier` / `onesignal_fallback`).

### 3. Migration
- `ALTER TABLE notification_dispatch_logs ADD COLUMN channel text DEFAULT 'onesignal'`.
- Update DB functions `invoke_push_to_user`, `invoke_push_broadcast`, `notify_users` to call `/functions/v1/dispatch-notification` instead of `/send-notification`. Inbox insert behavior unchanged.

### 4. Admin diagnostics UI (`PushDiagnostics.tsx`)
- Add a `channel` column to the table.
- Add a "Test Zapier pipeline" button that calls `dispatch-notification` with a broadcast test payload.
- Show a banner if `ZAPIER_WEBHOOK_URL` is unset (detect via a small status endpoint on the new function: `GET ?status=1` returns `{ zapier_configured: bool }`).

### 5. Keep
- `send-notification` stays exactly as-is (used as fallback + still callable manually).
- All existing triggers stay attached; only the URL inside the helper functions changes.
- Inbox / `notifications` table behavior unchanged.

## Zap setup the user must do (outside code)

1. Create a Zap → trigger: **Webhooks by Zapier → Catch Hook**. Copy the URL.
2. Add action: **OneSignal → Send a Push Notification**.
3. Map fields:
   - Heading → `title`
   - Content → `body`
   - If `broadcast` is `true` → use Segment "Subscribed Users"
   - Else → External User IDs = `userIds`
   - Additional Data → `data`
4. Turn the Zap on. Paste the webhook URL when Lovable prompts for `ZAPIER_WEBHOOK_URL`.

## Verification

1. After secret is set, hit "Test Zapier pipeline" in Admin → Push tab. Expect dispatch log row with `channel='zapier'`, `status='sent'`.
2. Check Zap history → 1 successful run; OneSignal step shows recipients > 0 (assuming subscribed devices).
3. Trigger a real action (post a like, send a message). Confirm matching dispatch log row + push lands on device.
4. Temporarily break the webhook URL (rotate secret to invalid) → confirm fallback row with `channel='onesignal_fallback'` and push still attempts via OneSignal.

## Out of scope

- Re-subscribing users on `nsp-main-app.vercel.app` (still required for push to reach 0+ recipients — orthogonal to Zapier wiring).
- Changing the inbox UI or other features.
