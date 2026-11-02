-- Authenticated trip members may upload only into their trip's staging prefix.
-- Final paths (docs/...) and all reads/updates/deletes stay server-only (service role).
CREATE POLICY "trip members stage document files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trip-files'
    AND (storage.foldername(name))[1] = 'staging'
    AND array_length(storage.foldername(name), 1) = 4
    AND public.can_access_trip(((storage.foldername(name))[2])::uuid)
  );