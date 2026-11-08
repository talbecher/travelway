-- Secure detach of a private document file: clears file_path/file_mime/file_size after a live
-- access check. The stored object is kept (no physical delete of approved files).
CREATE OR REPLACE FUNCTION public.detach_document_file(_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _d public.documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  SELECT * INTO _d FROM public.documents d WHERE d.id = _document_id;
  IF NOT FOUND OR NOT public.can_access_trip(_d.trip_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF _d.file_path IS NULL THEN RETURN jsonb_build_object('status', 'no_file'); END IF;
  PERFORM set_config('app.in_document_finalize', 'on', true);
  UPDATE public.documents SET file_path = NULL, file_mime = NULL, file_size = NULL WHERE id = _document_id;
  PERFORM set_config('app.in_document_finalize', '', true);
  RETURN jsonb_build_object('status', 'ok');
END $function$;

REVOKE ALL ON FUNCTION public.detach_document_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_document_file(uuid) TO authenticated, service_role;