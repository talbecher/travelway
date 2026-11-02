-- storage.foldername strips the file name, so staging/<trip>/<proposal>/<upload> yields 3 segments, not 4.
DROP POLICY "trip members stage document files" ON storage.objects;
CREATE POLICY "trip members stage document files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trip-files'
    AND (storage.foldername(name))[1] = 'staging'
    AND array_length(storage.foldername(name), 1) = 3
    AND public.can_access_trip(((storage.foldername(name))[2])::uuid)
  );