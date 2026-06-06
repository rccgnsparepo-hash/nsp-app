
-- VAPID columns for native Web Push
ALTER TABLE public.user_push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS p256dh text,
  ADD COLUMN IF NOT EXISTS auth text,
  ADD COLUMN IF NOT EXISTS expiration_time bigint;

-- player_id was OneSignal-only; allow null going forward
ALTER TABLE public.user_push_subscriptions
  ALTER COLUMN player_id DROP NOT NULL;

-- Drop legacy unique (user_id, player_id); new uniqueness is by endpoint
ALTER TABLE public.user_push_subscriptions
  DROP CONSTRAINT IF EXISTS user_push_subscriptions_user_id_player_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_push_subs_endpoint_unique
  ON public.user_push_subscriptions(endpoint)
  WHERE endpoint IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_push_subs_user_endpoint_idx
  ON public.user_push_subscriptions(user_id, endpoint)
  WHERE revoked_at IS NULL;
