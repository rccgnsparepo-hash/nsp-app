# Plan: Calls v2, Targeted Push, Chat Polish, News Feed & More

This is a big request — split into 7 phases. Each phase is independently shippable.

---

## Phase 1 — Per-user push routing (FIX FIRST)

**Problem:** Every chat message / prayer / call currently fans out to everyone because the Zap is targeting "All Subscribed Users" instead of using the `userIds` we send.

**What I'll do (code):**
- Audit `dispatch-notification` → confirm it always sends `userIds: [recipient_uuid]` for `type=message`, `type=call`, `type=prayer_interaction`, `type=post_like`, `type=post_comment`, `type=attendance_review`, `type=attendance_pending`.
- Add `sender_name`, `sender_id`, `preview`, `thread_url` as top-level fields in the Zapier payload (not nested in `data`) so they're easy to map in Zapier.
- Add a `target_mode` field: `"external_user_ids"` for 1:1, `"broadcast"` for admin posts / new attendance sessions / new prayer requests.

**What you do in each Zap (I'll give exact copy):**

For the **Chat** Zap (`ZAPIER_WEBHOOK_CHAT`):
- OneSignal → "Send Push Notification" action
- **Target Channel** → `Include External User IDs`
- **External User IDs** → map to `userIds` (Zapier shows it as a list)
- **Title** → `💬 {{sender_name}}`
- **Message** → `{{preview}}`
- **Launch URL** → `{{thread_url}}`

For **Prayer**, **Voice Note**, **YouTube**, **Gallery Post**, **Attendance** Zaps:
- **Target Channel** → `Send to Subscribed Users` (broadcast)
- **Title** → use the `title` field we send (already personalised, e.g. `🙏 John Doe shared a prayer request`)
- **Message** → `{{body}}`

I'll publish a printable "Zap setup card" inside the Admin → Push tab with these exact mappings per channel.

---

## Phase 2 — LiveKit Cloud calls + Capacitor native ringing

**You'll need to do (one-time):**
1. Sign up at livekit.io → create a project → copy the **WS URL**, **API Key**, **API Secret**.
2. I'll request these as 3 secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

**What I'll build:**
- New edge function `livekit-token` → mints a short-lived JWT for a given room when both participants are call-session members.
- Replace `useWebRTC` with `useLiveKit` using `livekit-client` SDK. Audio + video, automatic reconnect, SFU media (much higher quality than P2P).
- Keep current `call_sessions` table for ringing-state + history. Room name = `call_<sessionId>`.
- Native ringing via Capacitor:
  - Add Capacitor (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`) + `@capacitor-community/call-kit` (iOS) and a ConnectionService bridge (Android via `capacitor-callkeep`).
  - Push payload for `type=call` will include `voip: true` so OneSignal can deliver as a VoIP push (iOS) / high-priority data push (Android), which the native layer turns into a full-screen incoming-call UI **even when the app is closed**.
  - Web fallback (browser tab open): keep the in-app overlay.

**Caveat I want you to know now:** The native ringing only works on builds you install via Xcode/Android Studio after `npx cap sync`. Web/PWA cannot show the OS call screen — that's a platform limitation, not ours.

---

## Phase 3 — Chat polish

1. **Send latency (~2s → instant):**
   - Add optimistic insert: message appears in the thread the moment user taps Send, with a tiny "sending…" tick. Real row from realtime swaps it in.
   - Move the push trigger into a deferred `pg_net` call (already is) and stop awaiting it in the UI.
2. **Downloads for everything:** every photo / video / file bubble gets a download button using `<a download>` with a signed URL from `chat-media`. Long-press on mobile also offers Save.
3. **Chat backgrounds:**
   - New `chat_backgrounds` storage bucket (private) + `chat_preferences` table (`user_id`, `peer_id` nullable for global, `background_url`, `preset_key`).
   - Default = subtle SVG doodle pattern baked into `index.css`.
   - Settings → Chat → choose from 8 presets (doodle, gradient, solid, blueprint, etc.) OR upload custom.

---

## Phase 4 — Attendance CSV export fix

- Investigate `AdminPage` attendance tab — currently fires a toast but never triggers download.
- Replace with a real CSV builder (PapaParse) → `Blob` → `URL.createObjectURL` → programmatic `<a download="attendance_<session>_<date>.csv">` click.
- Include columns: name, email, phone, marked_at, status, reviewed_by, reviewed_at.
- Add an "Export all sessions (zip)" option using JSZip.

---

## Phase 5 — In-chat News Feed (faith-focused, in-app iframe)

- New tab inside Chat list page: **Trending**.
- New edge function `fetch-faith-news` → pulls + caches RSS from Christian Post, Premier Christian News, Relevant Magazine, Christianity Today, Crosswalk into existing `news_cache` table (already exists, schema fits). Runs on first request + every 30 min via on-demand refresh.
- Cards show title, source, image, time-ago, and "Posted by <source>".
- **No external navigation:** tapping a card opens an in-app `IframeReader` route (`/read?url=...`) with a top bar (back, share, open-in-browser fallback). All links inside that iframe also stay in the iframe by intercepting `target=_blank`.
- Note: a few sites set `X-Frame-Options: DENY` and physically can't be iframed. For those I'll show a clean reader-mode fallback (extracted text via the edge function using Mozilla Readability) so the user still never leaves the app.

---

## Phase 6 — Interactive birthday profiles (HomePage)

- Birthday cards on HomePage become tappable → route to `/u/:userId` (new public profile page).
- Public profile shows: avatar, name, bio, badges, post count, prayer count, **attendance calendar** (month grid coloured by approved/pending/absent for sessions on each date), services attended list, and a "Send message" button → opens `/chat/:userId`.
- Reuses existing `profiles`, `attendance_records`, `attendance_sessions`, `user_stats`, `user_badges` — no schema changes.

---

## Phase 7 — Personalised post / prayer notification copy

- All `notify_on_*` DB functions already pull `full_name` from profiles. I'll standardise titles to always include the name, e.g.:
  - Prayer: `🙏 {name} shared a prayer request` → body = preview
  - Voice note: `🎙️ {name} dropped a new voice note`
  - Gallery: `📸 {name} posted a new photo`
  - Comment: `💬 {name} commented on your post`
- Add `sender_id` + `sender_name` as top-level Zapier fields so your Zap templates can use `{{sender_name}}` directly (you don't have to dig into `data.actor_id`).

---

## Technical details (skip if non-technical)

```text
new tables:
  chat_preferences(user_id, peer_id nullable, background_url, preset_key, doodle_enabled bool default true)

new buckets:
  chat-backgrounds (private; RLS: user can read/write own folder)

new edge functions:
  livekit-token        -> mints JWT, validates session membership
  fetch-faith-news     -> RSS aggregator + Readability extractor for fallback

new secrets (you provide):
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

new packages:
  livekit-client, livekit-server-sdk (edge), papaparse, jszip,
  @capacitor/core @capacitor/ios @capacitor/android,
  capacitor-callkeep (or @capacitor-community/call-kit)

dispatch-notification additions:
  - top-level fields: sender_name, sender_id, preview, thread_url, target_mode, voip
  - voip=true when channel=='chat' and data.type=='call' (so OneSignal can route to VoIP cert on iOS)
```

---

## Build order

1. **Phase 1** (push routing) — fixes your loudest complaint, no new accounts needed.
2. **Phase 4** (attendance CSV) — tiny, independent.
3. **Phase 3** (chat polish: optimistic send, downloads, backgrounds).
4. **Phase 6** (birthday → profile).
5. **Phase 5** (news feed + in-app iframe).
6. **Phase 7** (personalised copy + Zap setup card).
7. **Phase 2** (LiveKit + Capacitor) — biggest piece, needs your secrets and a Mac/Android-Studio build to test native ringing.

I'll request the 3 LiveKit secrets at the start of Phase 2, not now, so you're not blocked.