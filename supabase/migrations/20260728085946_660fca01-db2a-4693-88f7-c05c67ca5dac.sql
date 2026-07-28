DROP POLICY IF EXISTS "All authed view records" ON public.attendance_records;
CREATE POLICY "Users view own or admin views all records"
ON public.attendance_records
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));