-- Centralized helper: notify a list of users (insert into inbox + dispatch via OneSignal)
CREATE OR REPLACE FUNCTION public.notify_users(_user_ids uuid[], _title text, _body text, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/send-notification';
  _kind text := COALESCE(_data->>'type', 'general');
BEGIN
  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
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
      'data', _data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_users failed: %', SQLERRM;
END;
$$;

-- New: post likes
CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _liker text;
BEGIN
  SELECT user_id INTO _owner FROM public.posts WHERE id = NEW.post_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, 'Someone') INTO _liker FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.notify_users(
    ARRAY[_owner],
    '❤️ ' || _liker || ' liked your post',
    'Tap to view your post',
    jsonb_build_object('type', 'post_like', 'post_id', NEW.post_id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

-- New: post comments (notify owner and parent comment author if reply)
CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _parent_author uuid;
  _commenter text;
  _targets uuid[];
BEGIN
  SELECT user_id INTO _owner FROM public.posts WHERE id = NEW.post_id;
  SELECT COALESCE(full_name, 'Someone') INTO _commenter FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO _parent_author FROM public.post_comments WHERE id = NEW.parent_id;
  END IF;

  _targets := ARRAY(
    SELECT DISTINCT uid FROM unnest(ARRAY[_owner, _parent_author]) AS uid
    WHERE uid IS NOT NULL AND uid <> NEW.user_id
  );

  IF array_length(_targets, 1) IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notify_users(
    _targets,
    '💬 ' || _commenter || (CASE WHEN NEW.parent_id IS NULL THEN ' commented on your post' ELSE ' replied to your comment' END),
    COALESCE(LEFT(NEW.content, 140), 'Tap to view'),
    jsonb_build_object('type', 'post_comment', 'post_id', NEW.post_id, 'comment_id', NEW.id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

-- New: prayer interactions
CREATE OR REPLACE FUNCTION public.notify_on_prayer_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _name text;
BEGIN
  SELECT user_id INTO _owner FROM public.prayer_requests WHERE id = NEW.prayer_request_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, 'Someone') INTO _name FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.notify_users(
    ARRAY[_owner],
    '🙏 ' || _name || ' is praying with you',
    'Tap to view your prayer request',
    jsonb_build_object('type', 'prayer_interaction', 'prayer_id', NEW.prayer_request_id, 'actor_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

-- Re-assert all triggers idempotently
DROP TRIGGER IF EXISTS posts_push_notify ON public.posts;
CREATE TRIGGER posts_push_notify AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_post();

DROP TRIGGER IF EXISTS prayers_push_notify ON public.prayer_requests;
CREATE TRIGGER prayers_push_notify AFTER INSERT ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_prayer();

DROP TRIGGER IF EXISTS messages_push_notify ON public.direct_messages;
CREATE TRIGGER messages_push_notify AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

DROP TRIGGER IF EXISTS attendance_session_notify ON public.attendance_sessions;
CREATE TRIGGER attendance_session_notify AFTER INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_attendance_session();

DROP TRIGGER IF EXISTS attendance_mark_notify ON public.attendance_records;
CREATE TRIGGER attendance_mark_notify AFTER INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_mark();

DROP TRIGGER IF EXISTS attendance_review_notify ON public.attendance_records;
CREATE TRIGGER attendance_review_notify AFTER UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_on_attendance_review();

DROP TRIGGER IF EXISTS post_likes_push_notify ON public.post_likes;
CREATE TRIGGER post_likes_push_notify AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();

DROP TRIGGER IF EXISTS post_comments_push_notify ON public.post_comments;
CREATE TRIGGER post_comments_push_notify AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_comment();

DROP TRIGGER IF EXISTS prayer_interactions_push_notify ON public.prayer_interactions;
CREATE TRIGGER prayer_interactions_push_notify AFTER INSERT ON public.prayer_interactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_prayer_interaction();