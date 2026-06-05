
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS dedupe_id text,
  ADD COLUMN IF NOT EXISTS group_key text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_idx
  ON public.notifications(user_id, dedupe_id) WHERE dedupe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_group_idx
  ON public.notifications(user_id, group_key) WHERE group_key IS NOT NULL;

ALTER TABLE public.user_push_subscriptions
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_push_subs_active_idx
  ON public.user_push_subscriptions(user_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows readable to authenticated" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create own follows" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "users delete own follows" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

CREATE TABLE IF NOT EXISTS public.post_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_reposts TO authenticated;
GRANT ALL ON public.post_reposts TO service_role;
ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposts readable" ON public.post_reposts FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create own reposts" ON public.post_reposts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own reposts" ON public.post_reposts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stories visible to authenticated" ON public.stories FOR SELECT TO authenticated USING (expires_at > now());
CREATE POLICY "users create own stories" ON public.stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own stories" ON public.stories FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "story owner sees views" ON public.story_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid()));
CREATE POLICY "users record own view" ON public.story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.story_reactions TO authenticated;
GRANT ALL ON public.story_reactions TO service_role;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions readable" ON public.story_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "users react" ON public.story_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own reaction" ON public.story_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  avatar_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communities readable" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner updates community" ON public.communities FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner deletes community" ON public.communities FOR DELETE TO authenticated USING (auth.uid() = owner_id);
DROP TRIGGER IF EXISTS communities_updated_at ON public.communities;
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_community_admin(_community_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id AND role IN ('owner','admin')
  ) OR EXISTS (
    SELECT 1 FROM public.communities WHERE id = _community_id AND owner_id = _user_id
  );
$$;

CREATE POLICY "members readable" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "user joins self" ON public.community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user leaves self" ON public.community_members FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "admins change roles" ON public.community_members FOR UPDATE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.community_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, invited_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_invites TO authenticated;
GRANT ALL ON public.community_invites TO service_role;
ALTER TABLE public.community_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitee or admin reads invite" ON public.community_invites FOR SELECT TO authenticated
  USING (auth.uid() = invited_user_id OR public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "admins invite" ON public.community_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_community_admin(community_id, auth.uid()) AND auth.uid() = invited_by);
CREATE POLICY "invitee responds" ON public.community_invites FOR UPDATE TO authenticated USING (auth.uid() = invited_user_id);

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'voice',
  room_url text,
  starts_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT ALL ON public.live_sessions TO service_role;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live readable" ON public.live_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "host creates live" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "host updates live" ON public.live_sessions FOR UPDATE TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "host deletes live" ON public.live_sessions FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS public.creator_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value bigint NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, value)
);
GRANT SELECT ON public.creator_milestones TO authenticated;
GRANT ALL ON public.creator_milestones TO service_role;
ALTER TABLE public.creator_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own milestones readable" ON public.creator_milestones FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notification_group_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_key text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  flush_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  flushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.notification_group_queue TO service_role;
ALTER TABLE public.notification_group_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notif_group_flush_idx
  ON public.notification_group_queue(flush_at) WHERE flushed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  segment jsonb NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_notifications TO authenticated;
GRANT ALL ON public.scheduled_notifications TO service_role;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage scheduled" ON public.scheduled_notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id uuid,
  _title text,
  _body text,
  _kind text,
  _url text,
  _data jsonb,
  _actor_id uuid,
  _entity_type text,
  _entity_id uuid,
  _dedupe_id text,
  _group_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _dispatch_url text := 'https://bidqhfxhftfkhdmxthtd.supabase.co/functions/v1/dispatch-notification';
BEGIN
  IF _user_id IS NULL OR _user_id = _actor_id THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, title, body, kind, data, actor_id, entity_type, entity_id, url, dedupe_id, group_key)
  VALUES (_user_id, _title, _body, _kind, COALESCE(_data,'{}'::jsonb), _actor_id, _entity_type, _entity_id, _url, _dedupe_id, _group_key)
  ON CONFLICT (user_id, dedupe_id) WHERE dedupe_id IS NOT NULL DO NOTHING;

  PERFORM net.http_post(
    url := _dispatch_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'userIds', jsonb_build_array(_user_id),
      'title', _title,
      'message', _body,
      'url', _url,
      'data', COALESCE(_data,'{}'::jsonb) || jsonb_build_object('dedupe_id', _dedupe_id, 'url', _url, 'kind', _kind),
      'dedupe_id', _dedupe_id,
      'group_key', _group_key
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_notification failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  SELECT COALESCE(full_name,'Someone') INTO _name FROM public.profiles WHERE id = NEW.follower_id;
  PERFORM public.enqueue_notification(
    NEW.following_id, _name || ' followed you', 'Tap to view their profile',
    'follow', '/u/' || NEW.follower_id::text,
    jsonb_build_object('follower_id', NEW.follower_id),
    NEW.follower_id, 'follow', NEW.id,
    'follow:'||NEW.id::text, 'follow:'||NEW.following_id::text
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.follows;
CREATE TRIGGER trg_notify_on_follow AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text;
BEGIN
  SELECT user_id INTO _owner FROM public.posts WHERE id = NEW.post_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name,'Someone') INTO _name FROM public.profiles WHERE id = NEW.user_id;
  PERFORM public.enqueue_notification(
    _owner,
    _name || (CASE WHEN NEW.quote_content IS NOT NULL THEN ' quoted your post' ELSE ' reposted your post' END),
    COALESCE(LEFT(NEW.quote_content,140),'Tap to view'),
    'repost', '/post/'||NEW.post_id::text,
    jsonb_build_object('post_id', NEW.post_id),
    NEW.user_id, 'post', NEW.post_id,
    'repost:'||NEW.id::text, 'repost:'||NEW.post_id::text
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_on_repost ON public.post_reposts;
CREATE TRIGGER trg_notify_on_repost AFTER INSERT ON public.post_reposts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();

CREATE OR REPLACE FUNCTION public.notify_on_story_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text;
BEGIN
  SELECT user_id INTO _owner FROM public.stories WHERE id = NEW.story_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name,'Someone') INTO _name FROM public.profiles WHERE id = NEW.user_id;
  PERFORM public.enqueue_notification(
    _owner, _name || ' reacted ' || NEW.reaction || ' to your story', 'Tap to view',
    'story_reaction', '/story/'||NEW.story_id::text,
    jsonb_build_object('story_id', NEW.story_id),
    NEW.user_id, 'story', NEW.story_id,
    'story_react:'||NEW.id::text, 'story_react:'||NEW.story_id::text
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_on_story_reaction ON public.story_reactions;
CREATE TRIGGER trg_notify_on_story_reaction AFTER INSERT ON public.story_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_story_reaction();

CREATE OR REPLACE FUNCTION public.notify_on_community_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cname text; _iname text;
BEGIN
  SELECT name INTO _cname FROM public.communities WHERE id = NEW.community_id;
  SELECT COALESCE(full_name,'Someone') INTO _iname FROM public.profiles WHERE id = NEW.invited_by;
  PERFORM public.enqueue_notification(
    NEW.invited_user_id,
    _iname || ' invited you to ' || COALESCE(_cname,'a community'),
    'Tap to accept or decline',
    'community_invite', '/community/'||NEW.community_id::text,
    jsonb_build_object('community_id', NEW.community_id),
    NEW.invited_by, 'community', NEW.community_id,
    'invite:'||NEW.id::text, 'invite:'||NEW.community_id::text
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_on_community_invite ON public.community_invites;
CREATE TRIGGER trg_notify_on_community_invite AFTER INSERT ON public.community_invites
FOR EACH ROW EXECUTE FUNCTION public.notify_on_community_invite();

CREATE OR REPLACE FUNCTION public.notify_on_live_started()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _follower uuid;
BEGIN
  IF NEW.started_at IS NULL OR OLD.started_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name,'Someone') INTO _name FROM public.profiles WHERE id = NEW.host_id;
  FOR _follower IN SELECT follower_id FROM public.follows WHERE following_id = NEW.host_id LOOP
    PERFORM public.enqueue_notification(
      _follower, '🔴 ' || _name || ' is live', NEW.title,
      'live', '/live/'||NEW.id::text,
      jsonb_build_object('live_id', NEW.id, 'kind', NEW.kind),
      NEW.host_id, 'live', NEW.id,
      'live:'||NEW.id::text||':'||_follower::text, 'live:'||NEW.id::text
    );
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_on_live_started ON public.live_sessions;
CREATE TRIGGER trg_notify_on_live_started AFTER UPDATE ON public.live_sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_live_started();
