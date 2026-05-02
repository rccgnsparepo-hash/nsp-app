DROP TRIGGER IF EXISTS posts_push_notify ON public.posts;
CREATE TRIGGER posts_push_notify
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_post();

DROP TRIGGER IF EXISTS prayers_push_notify ON public.prayer_requests;
CREATE TRIGGER prayers_push_notify
AFTER INSERT ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_prayer();

DROP TRIGGER IF EXISTS messages_push_notify ON public.direct_messages;
CREATE TRIGGER messages_push_notify
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

DROP TRIGGER IF EXISTS attendance_session_notify ON public.attendance_sessions;
CREATE TRIGGER attendance_session_notify
AFTER INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_attendance_session();

DROP TRIGGER IF EXISTS attendance_mark_notify ON public.attendance_records;
CREATE TRIGGER attendance_mark_notify
AFTER INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_mark();

DROP TRIGGER IF EXISTS attendance_review_notify ON public.attendance_records;
CREATE TRIGGER attendance_review_notify
AFTER UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_on_attendance_review();