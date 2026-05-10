# Plan: Sectionalized Push + Telegram-style Chat + Calls

This is a large build. I'll do it in 5 phases, each independently shippable.

---

## Phase 1 — 6 Zapier webhooks (sectionalized notifications)

You'll create **6 separate Zaps** in Zapier, each with its own Catch Hook → OneSignal action. I'll add 6 secrets so each has its own URL slot:

| # | Secret name | Triggers that hit it | Audience |
|---|---|---|---|
| 1 | `ZAPIER_WEBHOOK_CHAT` | New direct message | Recipient only |
| 2 | `ZAPIER_WEBHOOK_GALLERY_POST` | New image/video post | Broadcast |
| 3 | `ZAPIER_WEBHOOK_VOICE_NOTE` | New voice-note post | Broadcast |
| 4 | `ZAPIER_WEBHOOK_YOUTUBE_POST` | New YouTube post | Broadcast |
| 5 | `ZAPIER_WEBHOOK_PRAYER` | New prayer request, prayer interaction | Broadcast / owner |
| 6 | `ZAPIER_WEBHOOK_ATTENDANCE` | New session, review result, admin pending mark | Broadcast / user / admins |

**Where you paste each URL:** I'll trigger the secret-input dialog (one entry per secret). Each appears as its own field in your Lovable Cloud secrets.

**How routing works:** `dispatch-notification` reads `data.type` from each push and picks the matching `ZAPIER_WEBHOOK_*`. Likes/comments/general fall back to `ZAPIER_WEBHOOK_CHAT`'s sibling default (or OneSignal direct) — you can keep current behavior or I'll add a 7th catch-all later.

Admin "Push" tab will show a row per webhook with **configured / not configured** + a per-channel test button.

---

## Phase 2 — Admin-only debug panel + Settings fix

- `PushDebugPanel` rendered only when `isAdmin` (currently shown to every authenticated user).
- Investigate Settings: viewport is desktop (1145px) — the bottom tab now has 6 tabs after Admin is added; check for layout overflow hiding the page or a routing/click issue. Read `SettingsPage.tsx`, `BottomTabBar`, route entry, and any console errors. Fix whatever blocks toggling dark mode and viewing the page.

---

## Phase 3 — Chat media (images, videos, files)

- New public storage bucket `chat-media` with RLS so only sender/recipient can read.
- Add columns to `direct_messages`: `media_url`, `media_type` (`image|video|file`), `media_name`, `media_size`, `media_mime`.
- Limits: **25MB images, 200MB video, 100MB files** (client-side validation + UI).
- `ChatThreadPage` UI: paperclip menu (Photo / Video / File), inline previews (image thumb, video player, file card with size + download), upload progress.
- Reuse existing send-message flow; push payload includes media type so notification reads "📷 Photo", "🎥 Video", "📎 File".

---

## Phase 4 — 1:1 WebRTC voice/video calls

- New table `call_sessions` (caller_id, callee_id, type `audio|video`, status `ringing|active|ended|missed|declined`, started_at, ended_at, duration_sec).
- New table `call_signals` (session_id, from_user, payload jsonb) for SDP offer/answer + ICE candidates over Supabase Realtime.
- Enable realtime on both tables.
- New `useWebRTC` hook handling: getUserMedia, RTCPeerConnection, signal exchange, hangup cleanup.
- New components: `CallButton` (in chat header), `IncomingCallOverlay` (global, shows when callee gets a `ringing` row), `ActiveCallScreen` (full-screen with mute / camera-toggle / hangup).
- STUN: Google public servers (`stun:stun.l.google.com:19302`). **TURN note:** without a TURN server, calls fail across strict NATs (~10-20% of users). I'll add a clear UI warning + an env slot `TURN_URL` / `TURN_USER` / `TURN_CRED` for when you sign up for one (e.g. Twilio, Metered, Cloudflare). Calls will work for most users immediately.
- Push notification on incoming call routes through `ZAPIER_WEBHOOK_CHAT` (it's a personal ping).

---

## Phase 5 — Verification

After each phase: read updated files, check console + edge logs, hit Zapier status probe per channel, send a test message with media, place a test call between two browser windows.

---

## Order of operations

1. Phase 2 first (small, unblocks you using Settings).
2. Phase 1 next (request 6 secrets — you fill in URLs while I build).
3. Phase 3 (chat media).
4. Phase 4 (calls — biggest).

Approve and I'll start with Phase 2 + the 6-secret request immediately.
