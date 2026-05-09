
ALTER TABLE public.notification_dispatch_logs
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'unknown';

CREATE OR REPLACE FUNCTION public.invoke_push_to_user(_user_id uuid, _title text, _body text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
  _kind text := COALESCE(_data->>'type', 'general');
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
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
  _kind text := COALESCE(_data->>'type', 'general');
BEGIN
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

CREATE OR REPLACE FUNCTION public.notify_users(_user_ids uuid[], _title text, _body text, _data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
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
$function$;
