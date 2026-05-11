
-- 1. chat_preferences
CREATE TABLE IF NOT EXISTS public.chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  peer_id uuid,
  preset_key text NOT NULL DEFAULT 'doodle',
  background_url text,
  doodle_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, peer_id)
);
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own chat prefs" ON public.chat_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. news_articles
CREATE TABLE IF NOT EXISTS public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  source text NOT NULL,
  image_url text,
  summary text,
  category text NOT NULL DEFAULT 'faith',
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_articles_published_idx ON public.news_articles (published_at DESC NULLS LAST);
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads news" ON public.news_articles FOR SELECT TO public USING (true);
-- writes only via service role (no policy)

-- 3. chat-backgrounds bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-backgrounds', 'chat-backgrounds', false, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chat-bg owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chat-bg owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chat-bg owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chat-bg owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. Enrich invoke_push_to_user with sender_name & preview from data
CREATE OR REPLACE FUNCTION public.invoke_push_to_user(_user_id uuid, _title text, _body text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
  _kind text := COALESCE(_data->>'type', 'general');
  _sender_id uuid := NULLIF(COALESCE(_data->>'sender_id', _data->>'caller_id', _data->>'actor_id'), '')::uuid;
  _sender_name text := COALESCE(_data->>'sender_name', _data->>'caller_name');
BEGIN
  INSERT INTO public.notifications (user_id, title, body, kind, data)
  VALUES (_user_id, _title, _body, _kind, _data);

  PERFORM net.http_post(
    url := _url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'userIds', jsonb_build_array(_user_id),
      'title', _title,
      'message', _body,
      'data', _data,
      'sender_id', _sender_id,
      'sender_name', _sender_name,
      'preview', _body,
      'target_mode', 'external_user_ids'
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_push_to_user failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_users(_user_ids uuid[], _title text, _body text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
  _kind text := COALESCE(_data->>'type', 'general');
  _sender_id uuid := NULLIF(COALESCE(_data->>'sender_id', _data->>'actor_id'), '')::uuid;
  _sender_name text;
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF _sender_id IS NOT NULL THEN
    SELECT full_name INTO _sender_name FROM public.profiles WHERE id = _sender_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, kind, data)
  SELECT uid, _title, _body, _kind, _data FROM unnest(_user_ids) AS uid;

  PERFORM net.http_post(
    url := _url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'userIds', to_jsonb(_user_ids),
      'title', _title,
      'message', _body,
      'data', _data,
      'sender_id', _sender_id,
      'sender_name', _sender_name,
      'preview', _body,
      'target_mode', 'external_user_ids'
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_users failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_push_broadcast(_title text, _body text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
  _kind text := COALESCE(_data->>'type', 'general');
  _sender_id uuid := NULLIF(COALESCE(_data->>'sender_id', _data->>'actor_id', _data->>'user_id'), '')::uuid;
  _sender_name text;
BEGIN
  IF _sender_id IS NOT NULL THEN
    SELECT full_name INTO _sender_name FROM public.profiles WHERE id = _sender_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, kind, data)
  SELECT id, _title, _body, _kind, _data FROM public.profiles;

  PERFORM net.http_post(
    url := _url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'broadcast', true,
      'title', _title,
      'message', _body,
      'data', _data,
      'sender_id', _sender_id,
      'sender_name', _sender_name,
      'preview', _body,
      'target_mode', 'broadcast'
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_push_broadcast failed: %', SQLERRM;
END;
$$;

-- 5. Update notify functions to populate sender info in data
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _sender text;
  _preview text;
BEGIN
  SELECT COALESCE(full_name, 'Someone') INTO _sender
  FROM public.profiles WHERE id = NEW.sender_id;

  IF NEW.media_type = 'image' THEN _preview := '📷 Photo';
  ELSIF NEW.media_type = 'video' THEN _preview := '🎥 Video';
  ELSIF NEW.media_type = 'file' THEN _preview := '📎 ' || COALESCE(NEW.media_name, 'File');
  ELSE _preview := COALESCE(LEFT(NEW.content, 140), 'Tap to view');
  END IF;

  PERFORM public.invoke_push_to_user(
    NEW.recipient_id,
    _sender,
    _preview,
    jsonb_build_object(
      'type','message',
      'message_id',NEW.id,
      'sender_id',NEW.sender_id,
      'sender_name',_sender,
      'media_type',NEW.media_type,
      'thread_url','/chat/'||NEW.sender_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _caller text;
BEGIN
  SELECT COALESCE(full_name, 'Someone') INTO _caller
  FROM public.profiles WHERE id = NEW.caller_id;

  PERFORM public.invoke_push_to_user(
    NEW.callee_id,
    'Incoming ' || NEW.kind || ' call',
    _caller || ' is calling you',
    jsonb_build_object(
      'type','call',
      'session_id',NEW.id,
      'caller_id',NEW.caller_id,
      'caller_name',_caller,
      'sender_name',_caller,
      'sender_id',NEW.caller_id,
      'kind',NEW.kind,
      'voip',true,
      'thread_url','/chat/'||NEW.caller_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_prayer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _name text;
BEGIN
  SELECT COALESCE(full_name, 'A community member') INTO _name
  FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.invoke_push_broadcast(
    _name || ' shared a prayer request',
    COALESCE(LEFT(NEW.message, 140), 'Tap to read and pray together'),
    jsonb_build_object(
      'type','prayer',
      'prayer_id',NEW.id,
      'sender_id',NEW.user_id,
      'sender_name',_name,
      'thread_url','/prayer'
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _title text;
  _body text;
  _name  text;
BEGIN
  SELECT COALESCE(full_name, 'Admin') INTO _name FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.type = 'voice' THEN
    _title := _name || ' posted a Voice Note';
    _body := COALESCE(NEW.caption, 'Tap to listen');
  ELSIF NEW.type = 'youtube' THEN
    _title := _name || ' shared a YouTube video';
    _body := COALESCE(NEW.caption, 'Watch the latest post');
  ELSIF NEW.type = 'video' THEN
    _title := _name || ' posted a new video';
    _body := COALESCE(NEW.caption, 'A new video is available');
  ELSE
    _title := _name || ' posted a new image';
    _body := COALESCE(NEW.caption, 'Tap to view');
  END IF;

  PERFORM public.invoke_push_broadcast(
    _title,
    _body,
    jsonb_build_object(
      'type','post',
      'post_id',NEW.id,
      'post_type',NEW.type,
      'sender_id',NEW.user_id,
      'sender_name',_name,
      'thread_url','/'
    )
  );
  RETURN NEW;
END;
$$;
