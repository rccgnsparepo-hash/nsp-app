
-- 1. Drop FK to auth.users, add FK to profiles
ALTER TABLE public.prayer_requests
  DROP CONSTRAINT IF EXISTS prayer_requests_user_id_fkey;

ALTER TABLE public.prayer_requests
  ADD CONSTRAINT prayer_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Voice notes bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voicenotes', 'voicenotes', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public can read voicenotes" ON storage.objects FOR SELECT
    USING (bucket_id = 'voicenotes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can upload voicenotes" ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'voicenotes' AND public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can delete voicenotes" ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'voicenotes' AND public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Realtime replica identity (publication membership already exists)
ALTER TABLE public.prayer_requests REPLICA IDENTITY FULL;
ALTER TABLE public.posts REPLICA IDENTITY FULL;
