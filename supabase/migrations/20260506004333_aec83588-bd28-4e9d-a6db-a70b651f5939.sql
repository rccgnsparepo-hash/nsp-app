
-- New chat message → push to recipient
DROP TRIGGER IF EXISTS trg_notify_on_new_message ON public.direct_messages;
CREATE TRIGGER trg_notify_on_new_message
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- New post → broadcast
DROP TRIGGER IF EXISTS trg_notify_on_new_post ON public.posts;
CREATE TRIGGER trg_notify_on_new_post
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_post();

-- New prayer → broadcast
DROP TRIGGER IF EXISTS trg_notify_on_new_prayer ON public.prayer_requests;
CREATE TRIGGER trg_notify_on_new_prayer
AFTER INSERT ON public.prayer_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_prayer();

-- New attendance session → broadcast
DROP TRIGGER IF EXISTS trg_notify_on_new_attendance_session ON public.attendance_sessions;
CREATE TRIGGER trg_notify_on_new_attendance_session
AFTER INSERT ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_attendance_session();

-- Attendance review → notify the user
DROP TRIGGER IF EXISTS trg_notify_on_attendance_review ON public.attendance_records;
CREATE TRIGGER trg_notify_on_attendance_review
AFTER UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_on_attendance_review();

-- New attendance mark → notify admins
DROP TRIGGER IF EXISTS trg_notify_admins_new_mark ON public.attendance_records;
CREATE TRIGGER trg_notify_admins_new_mark
AFTER INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_mark();

-- Likes → notify post author
DROP TRIGGER IF EXISTS trg_notify_on_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_on_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_like();

-- Comments → notify post/parent author
DROP TRIGGER IF EXISTS trg_notify_on_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_on_post_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_comment();

-- Prayer interaction → notify prayer owner
DROP TRIGGER IF EXISTS trg_notify_on_prayer_interaction ON public.prayer_interactions;
CREATE TRIGGER trg_notify_on_prayer_interaction
AFTER INSERT ON public.prayer_interactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_prayer_interaction();
