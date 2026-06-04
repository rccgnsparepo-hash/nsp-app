
-- 1. Purge existing prayer data
DELETE FROM public.prayer_interactions;
DELETE FROM public.prayer_requests;

-- 2. Restrict prayer creation to admins only
DROP POLICY IF EXISTS "Users create own prayers" ON public.prayer_requests;
CREATE POLICY "Admins create prayers"
  ON public.prayer_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own prayers" ON public.prayer_requests;
CREATE POLICY "Admins delete prayers"
  ON public.prayer_requests
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add onboarding tour flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false;
