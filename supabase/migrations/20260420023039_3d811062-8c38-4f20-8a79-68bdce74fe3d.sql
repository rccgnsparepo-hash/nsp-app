-- 1. NOTIFICATIONS LOG TABLE
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 2. ATTENDANCE SESSIONS
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  session_date date NOT NULL,
  session_time time,
  location text,
  created_by uuid NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendance_sessions_date ON public.attendance_sessions(session_date DESC);
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authed view sessions" ON public.attendance_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin create sessions" ON public.attendance_sessions
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update sessions" ON public.attendance_sessions
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete sessions" ON public.attendance_sessions
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
ALTER TABLE public.attendance_sessions REPLICA IDENTITY FULL;

-- 3. ATTENDANCE RECORDS
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  marked_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  UNIQUE(session_id, user_id)
);
CREATE INDEX idx_att_records_session ON public.attendance_records(session_id);
CREATE INDEX idx_att_records_user ON public.attendance_records(user_id);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authed view records" ON public.attendance_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "User marks own attendance" ON public.attendance_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User can re-mark own pending" ON public.attendance_records
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admin can review records" ON public.attendance_records
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete records" ON public.attendance_records
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER TABLE public.attendance_records REPLICA IDENTITY FULL;

-- 4. INVOKE PUSH HELPERS (recreate to also log into notifications)
CREATE OR REPLACE FUNCTION public.invoke_push_to_user(_user_id uuid, _title text, _body text, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/send-notification';
  _kind text := COALESCE(_data->>'type', 'general');
BEGIN
  -- Log to inbox
  INSERT INTO public.notifications (user_id, title, body, kind, data)
  VALUES (_user_id, _title, _body, _kind, _data);

  PERFORM net.http_post(
    url := _url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'userIds', jsonb_build_array(_user_id),
      'title', _title,
      'message', _body,
      'data', _data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_push_to_user failed: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_push_broadcast(_title text, _body text, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/send-notification';
  _kind text := COALESCE(_data->>'type', 'general');
BEGIN
  -- Log to inbox for every authenticated user
  INSERT INTO public.notifications (user_id, title, body, kind, data)
  SELECT id, _title, _body, _kind, _data FROM public.profiles;

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
  RAISE WARNING 'invoke_push_broadcast failed: %', SQLERRM;
END;
$function$;

-- 5. DIRECT MESSAGE PUSH TRIGGER (ensure attached)
DROP TRIGGER IF EXISTS messages_push_notify ON public.direct_messages;
CREATE TRIGGER messages_push_notify
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- Also ensure post + prayer triggers are attached
DROP TRIGGER IF EXISTS posts_push_notify ON public.posts;
CREATE TRIGGER posts_push_notify
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_post();

DROP TRIGGER IF EXISTS prayers_push_notify ON public.prayer_requests;
CREATE TRIGGER prayers_push_notify
AFTER INSERT ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_prayer();

-- 6. ATTENDANCE NOTIFICATIONS
CREATE OR REPLACE FUNCTION public.notify_on_new_attendance_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.invoke_push_broadcast(
    '📋 New attendance session: ' || NEW.title,
    'Tap to mark your attendance for ' || to_char(NEW.session_date, 'Mon DD'),
    jsonb_build_object('type', 'attendance_session', 'session_id', NEW.id)
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_session_notify
AFTER INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_attendance_session();

CREATE OR REPLACE FUNCTION public.notify_on_attendance_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _title text;
  _session_title text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  SELECT title INTO _session_title FROM public.attendance_sessions WHERE id = NEW.session_id;

  IF NEW.status = 'approved' THEN
    _title := '✅ Attendance approved';
  ELSE
    _title := '❌ Attendance rejected';
  END IF;

  PERFORM public.invoke_push_to_user(
    NEW.user_id,
    _title,
    'Your attendance for "' || COALESCE(_session_title,'session') || '" was ' || NEW.status,
    jsonb_build_object('type','attendance_review','session_id',NEW.session_id,'status',NEW.status)
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_review_notify
AFTER UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_on_attendance_review();

-- Notify admins when user marks attendance
CREATE OR REPLACE FUNCTION public.notify_admins_new_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _session_title text;
  _admin record;
BEGIN
  SELECT COALESCE(full_name,'Someone') INTO _name FROM public.profiles WHERE id = NEW.user_id;
  SELECT title INTO _session_title FROM public.attendance_sessions WHERE id = NEW.session_id;

  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.invoke_push_to_user(
      _admin.user_id,
      '🙋 ' || _name || ' marked attendance',
      'Awaiting approval for "' || COALESCE(_session_title,'session') || '"',
      jsonb_build_object('type','attendance_pending','session_id',NEW.session_id,'record_id',NEW.id)
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_mark_notify
AFTER INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_mark();