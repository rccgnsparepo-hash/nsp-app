
-- 1. direct_messages media columns
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_mime text;

ALTER TABLE public.direct_messages ALTER COLUMN content DROP NOT NULL;

-- allow content to be empty when media is present
CREATE OR REPLACE FUNCTION public.dm_validate_payload()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.content IS NULL OR length(trim(NEW.content)) = 0)
     AND (NEW.media_url IS NULL OR length(trim(NEW.media_url)) = 0) THEN
    RAISE EXCEPTION 'direct_messages: must have either content or media_url';
  END IF;
  IF NEW.content IS NULL THEN NEW.content := ''; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dm_validate_payload_trg ON public.direct_messages;
CREATE TRIGGER dm_validate_payload_trg
  BEFORE INSERT OR UPDATE ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.dm_validate_payload();

-- 2. chat-media bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: path layout is `<sender_id>/<recipient_id>/<filename>` OR `<userA>__<userB>/<filename>`
DROP POLICY IF EXISTS "chat-media: sender uploads" ON storage.objects;
CREATE POLICY "chat-media: sender uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "chat-media: participants read" ON storage.objects;
CREATE POLICY "chat-media: participants read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR auth.uid()::text = (storage.foldername(name))[2]
  )
);

DROP POLICY IF EXISTS "chat-media: sender deletes" ON storage.objects;
CREATE POLICY "chat-media: sender deletes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. update notify_on_new_message to describe media
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
    '💬 ' || _sender,
    _preview,
    jsonb_build_object('type','message','message_id',NEW.id,'sender_id',NEW.sender_id,'sender_name',_sender,'media_type',NEW.media_type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_new_message_trg ON public.direct_messages;
CREATE TRIGGER notify_on_new_message_trg
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- 4. call_sessions
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('audio','video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','active','ended','missed','declined')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_sessions_callee_idx ON public.call_sessions (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_sessions_caller_idx ON public.call_sessions (caller_id, created_at DESC);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calls: participants view" ON public.call_sessions;
CREATE POLICY "calls: participants view" ON public.call_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "calls: caller creates" ON public.call_sessions;
CREATE POLICY "calls: caller creates" ON public.call_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "calls: participants update" ON public.call_sessions;
CREATE POLICY "calls: participants update" ON public.call_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- 5. call_signals
CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  from_user uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_signals_session_idx ON public.call_signals (session_id, created_at);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signals: participants view" ON public.call_signals;
CREATE POLICY "signals: participants view" ON public.call_signals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.call_sessions s
            WHERE s.id = session_id AND (s.caller_id = auth.uid() OR s.callee_id = auth.uid()))
  );

DROP POLICY IF EXISTS "signals: participants insert" ON public.call_signals;
CREATE POLICY "signals: participants insert" ON public.call_signals
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user
    AND EXISTS (SELECT 1 FROM public.call_sessions s
                WHERE s.id = session_id AND (s.caller_id = auth.uid() OR s.callee_id = auth.uid()))
  );

-- 6. realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
ALTER TABLE public.call_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;

-- 7. push notification on new ringing call
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
    '📞 Incoming ' || NEW.kind || ' call',
    _caller || ' is calling you',
    jsonb_build_object('type','call','session_id',NEW.id,'caller_id',NEW.caller_id,'caller_name',_caller,'kind',NEW.kind)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_new_call_trg ON public.call_sessions;
CREATE TRIGGER notify_on_new_call_trg
  AFTER INSERT ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_call();
