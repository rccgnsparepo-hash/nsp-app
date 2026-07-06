DROP POLICY IF EXISTS "Anyone can view stats" ON public.user_stats;
CREATE POLICY "Authenticated can view stats" ON public.user_stats FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.user_stats FROM anon;