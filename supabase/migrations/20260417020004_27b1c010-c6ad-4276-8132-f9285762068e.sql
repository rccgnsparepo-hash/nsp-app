-- User stats for gamification
CREATE TABLE public.user_stats (
  user_id UUID PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0,
  login_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  total_posts INTEGER NOT NULL DEFAULT 0,
  total_prayers INTEGER NOT NULL DEFAULT 0,
  total_amens_received INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stats" ON public.user_stats FOR SELECT USING (true);
CREATE POLICY "Users insert own stats" ON public.user_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own stats" ON public.user_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Badges
CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_type TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_type)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badges" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "Users insert own badges" ON public.user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- News cache
CREATE TABLE public.news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  source TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view news" ON public.news_cache FOR SELECT USING (true);
CREATE POLICY "Admin manage news" ON public.news_cache FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role)) 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_news_fetched ON public.news_cache (fetched_at DESC);
CREATE INDEX idx_news_category ON public.news_cache (category);

-- Memes cache
CREATE TABLE public.memes_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  title TEXT,
  image_url TEXT NOT NULL,
  source TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memes_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view memes" ON public.memes_cache FOR SELECT USING (true);
CREATE POLICY "Admin manage memes" ON public.memes_cache FOR ALL TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role)) 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to award points and update streak on login
CREATE OR REPLACE FUNCTION public.record_daily_login(_user_id UUID)
RETURNS TABLE (points INTEGER, streak INTEGER, awarded_badge TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last_date DATE;
  _new_streak INTEGER;
  _new_points INTEGER;
  _badge TEXT := NULL;
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  
  SELECT last_login_date INTO _last_date FROM public.user_stats WHERE user_id = _user_id;
  
  IF _last_date = CURRENT_DATE THEN
    SELECT us.points, us.login_streak INTO _new_points, _new_streak FROM public.user_stats us WHERE user_id = _user_id;
  ELSIF _last_date = CURRENT_DATE - INTERVAL '1 day' THEN
    UPDATE public.user_stats SET 
      login_streak = login_streak + 1,
      points = points + 10,
      last_login_date = CURRENT_DATE,
      updated_at = now()
    WHERE user_id = _user_id
    RETURNING user_stats.points, user_stats.login_streak INTO _new_points, _new_streak;
  ELSE
    UPDATE public.user_stats SET 
      login_streak = 1,
      points = points + 5,
      last_login_date = CURRENT_DATE,
      updated_at = now()
    WHERE user_id = _user_id
    RETURNING user_stats.points, user_stats.login_streak INTO _new_points, _new_streak;
  END IF;
  
  -- Award streak badges
  IF _new_streak >= 7 THEN
    INSERT INTO public.user_badges (user_id, badge_type) VALUES (_user_id, 'streak_master') ON CONFLICT DO NOTHING;
    IF FOUND THEN _badge := 'streak_master'; END IF;
  END IF;
  IF _new_streak >= 30 THEN
    INSERT INTO public.user_badges (user_id, badge_type) VALUES (_user_id, 'streak_legend') ON CONFLICT DO NOTHING;
    IF FOUND THEN _badge := 'streak_legend'; END IF;
  END IF;
  
  RETURN QUERY SELECT _new_points, _new_streak, _badge;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;