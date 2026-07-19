
CREATE POLICY "auth read rec-photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rec-photos');

CREATE POLICY "auth upload rec-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rec-photos' AND owner = auth.uid());

CREATE POLICY "auth update rec-photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rec-photos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'rec-photos' AND owner = auth.uid());

CREATE POLICY "auth delete rec-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rec-photos' AND owner = auth.uid());
