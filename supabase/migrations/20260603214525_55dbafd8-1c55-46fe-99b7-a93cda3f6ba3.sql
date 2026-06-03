
-- 1) Restrict profiles SELECT to authenticated users (was public)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Authenticated can view profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

-- 2) Lock down user_badges INSERT to admins only.
-- Streak badges are awarded by public.record_daily_login which is SECURITY DEFINER and bypasses RLS.
DROP POLICY IF EXISTS "Users insert own badges" ON public.user_badges;
CREATE POLICY "Admins insert badges"
ON public.user_badges FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
