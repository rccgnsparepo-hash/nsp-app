
-- 1) Allow 'voice' type on posts (fixes "new row for posts violates check constraint")
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_type_check
  CHECK (type = ANY (ARRAY['image'::text, 'youtube'::text, 'video'::text, 'voice'::text]));

-- 2) Improve prayer notification: include sender name + message
CREATE OR REPLACE FUNCTION public.notify_on_new_prayer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
BEGIN
  SELECT COALESCE(full_name, 'A community member') INTO _name
  FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.invoke_push_broadcast(
    '🙏 ' || _name || ' shared a prayer request',
    COALESCE(LEFT(NEW.message, 140), 'Tap to read and pray together'),
    jsonb_build_object('type', 'prayer', 'prayer_id', NEW.id, 'sender_name', _name)
  );
  RETURN NEW;
END;
$function$;

-- 3) Targeted push helper (single recipient via external_user_id)
CREATE OR REPLACE FUNCTION public.invoke_push_to_user(_user_id uuid, _title text, _body text, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/send-notification';
BEGIN
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

-- 4) Notify ONLY recipient on new direct message
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sender text;
BEGIN
  SELECT COALESCE(full_name, 'Someone') INTO _sender
  FROM public.profiles WHERE id = NEW.sender_id;

  PERFORM public.invoke_push_to_user(
    NEW.recipient_id,
    '💬 ' || _sender || ' sent you a message',
    COALESCE(LEFT(NEW.content, 140), 'Tap to view'),
    jsonb_build_object('type', 'message', 'message_id', NEW.id, 'sender_id', NEW.sender_id, 'sender_name', _sender)
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS messages_push_notify ON public.direct_messages;
CREATE TRIGGER messages_push_notify
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();
