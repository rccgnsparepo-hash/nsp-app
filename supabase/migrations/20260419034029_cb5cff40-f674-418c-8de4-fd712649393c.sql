-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  player_id text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, player_id)
);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
ON public.user_push_subscriptions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own subscriptions"
ON public.user_push_subscriptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own subscriptions"
ON public.user_push_subscriptions FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own subscriptions"
ON public.user_push_subscriptions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Helper function to call the send-notification edge function
CREATE OR REPLACE FUNCTION public.invoke_push_broadcast(
  _title text,
  _body text,
  _data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/send-notification';
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'broadcast', true,
      'title', _title,
      'message', _body,
      'data', _data
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never fail the user's INSERT because of a notification problem
  RAISE WARNING 'invoke_push_broadcast failed: %', SQLERRM;
END;
$$;

-- Trigger function for new posts
CREATE OR REPLACE FUNCTION public.notify_on_new_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _title text;
  _body text;
BEGIN
  IF NEW.type = 'voice' THEN
    _title := '🎙️ Admin posted a Voice Note';
    _body := COALESCE(NEW.caption, 'Tap to listen to the new voice note');
  ELSIF NEW.type = 'youtube' THEN
    _title := '▶️ Admin shared a YouTube video';
    _body := COALESCE(NEW.caption, 'Watch the latest YouTube post');
  ELSIF NEW.type = 'video' THEN
    _title := '🎬 Admin posted a new video';
    _body := COALESCE(NEW.caption, 'A new video is available');
  ELSE
    _title := '📸 Admin posted a new image';
    _body := COALESCE(NEW.caption, 'Tap to view the new image');
  END IF;

  PERFORM public.invoke_push_broadcast(
    _title,
    _body,
    jsonb_build_object('type', 'post', 'post_id', NEW.id, 'post_type', NEW.type)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_push_notify ON public.posts;
CREATE TRIGGER posts_push_notify
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_post();

-- Trigger function for prayer requests
CREATE OR REPLACE FUNCTION public.notify_on_new_prayer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invoke_push_broadcast(
    '🙏 New prayer request',
    COALESCE(LEFT(NEW.message, 90), 'A community member shared a prayer request'),
    jsonb_build_object('type', 'prayer', 'prayer_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prayer_push_notify ON public.prayer_requests;
CREATE TRIGGER prayer_push_notify
AFTER INSERT ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_prayer();

-- Fix voicenotes storage policies (the user-reported bug)
DROP POLICY IF EXISTS "Voicenotes public read" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload voicenotes" ON storage.objects;
DROP POLICY IF EXISTS "Admin update voicenotes" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete voicenotes" ON storage.objects;

CREATE POLICY "Voicenotes public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'voicenotes');

CREATE POLICY "Admin upload voicenotes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voicenotes' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update voicenotes"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'voicenotes' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin delete voicenotes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voicenotes' AND public.has_role(auth.uid(), 'admin'));