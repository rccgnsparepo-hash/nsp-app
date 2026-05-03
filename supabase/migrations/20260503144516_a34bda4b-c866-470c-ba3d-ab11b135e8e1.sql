
CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text,
  body text,
  target_type text,
  target_value jsonb,
  user_ids uuid[],
  recipients integer,
  onesignal_id text,
  status text NOT NULL DEFAULT 'unknown',
  error text,
  raw_response jsonb,
  request_payload jsonb
);

ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view dispatch logs" ON public.notification_dispatch_logs;
CREATE POLICY "Admins view dispatch logs"
  ON public.notification_dispatch_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_created ON public.notification_dispatch_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_user_ids ON public.notification_dispatch_logs USING GIN (user_ids);
