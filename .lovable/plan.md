
# Notification System Overhaul

You picked the maximum scope. Honest framing: this is realistically 4–6 build loops, not one. I'll execute in this loop in the order below and stop at a clean checkpoint when the context window forces it. Each phase ships working code — nothing is left half-wired.

## Phase 1 — Reliability core (this loop, must-ship)

Fix the root cause of "works from dashboard, fails from app activity."

- **Service worker hardening**: replace `public/OneSignalSDKWorker.js` shim with the official v16 worker, add `notificationclick` deep-link router, add `pushsubscriptionchange` handler.
- **Multi-device tokens**: `user_push_subscriptions` already exists; add `user_agent`, `last_seen_at`, `revoked_at`. Auto-prune dead tokens on send failure.
- **Auto-register on login**: already partially done in `AuthContext` — add permission state tracking, retry on `pushsubscriptionchange`, and a soft in-app prompt component (not the browser prompt) before requesting permission.
- **Deduplication**: every push carries a stable `dedupe_id` (event table PK). Service worker uses it as notification `tag` so re-sends collapse.
- **Deep-link router**: notification `data.url` → SW opens/focuses the right route (`/chat/:id`, `/post/:id`, `/prayer`, `/live/:id`, `/inbox`).
- **Send pipeline**: rewrite `dispatch-notification` to: dedupe by `dedupe_id`, batch by user, retry 3× with exponential backoff, log to `notification_dispatch_logs` (already exists), prune tokens that return 410/invalid.
- **Notifications table**: add `dedupe_id`, `url`, `actor_id`, `entity_type`, `entity_id`, `group_key`, `read_at`, `clicked_at`, `delivered_at`.

## Phase 2 — Missing event sources (this loop)

Wire DB triggers + edge dispatch for events that already have data models:

- post like, comment, reply, mention (parse `@handle` in content)
- DM, voice DM, message reaction
- prayer interaction, prayer comment
- incoming call (already exists — migrate to new pipeline)
- attendance review (already exists — migrate)
- admin broadcast (already exists — migrate)

## Phase 3 — Missing features (this loop if time permits, else next)

These don't exist in the schema yet. I'll add the minimal tables + RLS + triggers but **no UI** for them this loop — UI is its own large task:

- `follows` (follower_id, following_id) → follow / follow-back notifications
- `post_reposts` (post_id, user_id, quote_content?) → repost / quote notifications
- `stories` (user_id, media_url, expires_at) + `story_views`, `story_reactions`
- `communities`, `community_members`, `community_invites`
- `live_sessions` (host_id, kind, started_at, ended_at, room_url) → "X is live"
- `trending_signals` materialized view + cron job → "your post is trending"
- `creator_milestones` (follower counts, engagement thresholds)

UI for follows/stories/communities/live is **out of scope** for this loop. Pushes will fire when something else inserts into those tables. I'll flag this clearly.

## Phase 4 — Smart grouping (next loop)

- `notification_group_queue` table + 60s debounce window
- pg_cron job every 30s: flushes queue, collapses by `group_key` (e.g. `post_like:<post_id>`), sends one push: "3 people liked your post"
- In-app `/inbox` collapses same-group rows visually regardless.

## Phase 5 — Notification Center revamp (next loop)

- Rebuild `/inbox` with tabs: All / Mentions / Messages / Communities / System / Live
- Infinite scroll (cursor pagination)
- Mark all read, swipe-to-delete, search, filter
- Realtime via Supabase channel on `notifications`

## Phase 6 — Admin dashboard (next loop)

- `/admin/notifications`: compose broadcast, schedule (cron-fired), segment by role/community, view sent/delivered/opened/clicked rates from `notification_dispatch_logs`
- Cancel scheduled (status flag)
- Failure monitor

## Phase 7 — Offline + analytics polish (next loop)

- SW IndexedDB queue when offline → flush on `online` event
- Delivery tracking: SW reports `delivered`, click reports `clicked` via beacon to `/track-notification` edge function
- Analytics rollups view

## Technical notes

- **Stack**: OneSignal v16 web SDK stays (already paid/configured). All sends go through `dispatch-notification` edge function — never client-direct.
- **Dedupe**: `(user_id, dedupe_id)` unique index on `notifications` so the same event can't insert twice.
- **Permissions**: never auto-prompt — show soft in-app modal first ("Get notified when..."), then request browser permission only if user accepts.
- **Realtime**: `/inbox` subscribes to `notifications` filtered by `user_id=auth.uid()` for instant updates without a push round-trip.
- **Future mobile**: dispatch pipeline targets OneSignal external_user_id, which already covers iOS/Android once Capacitor wrappers exist — no rewrite needed.

## This loop's deliverable

Phase 1 + Phase 2 + Phase 3 schema-only. That's ~2 migrations, ~4 new edge function files, ~1 rewritten service worker, ~3 new client files, ~6 edited client files. Phases 4–7 will need follow-up messages from you.

## What I need from you to start

Just "go" and I'll execute. If you want to descope (e.g. skip Phase 3 stories/communities to make room for Phase 4 grouping), say so now.
