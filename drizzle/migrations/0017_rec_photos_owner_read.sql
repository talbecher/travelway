DROP POLICY IF EXISTS "auth read rec-photos" ON storage.objects;
CREATE POLICY "auth read rec-photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rec-photos' AND owner = (select auth.uid()));