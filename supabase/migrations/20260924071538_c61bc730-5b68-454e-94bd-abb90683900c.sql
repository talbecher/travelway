CREATE OR REPLACE FUNCTION public.mark_recommendation_booked(
  _rec_id uuid, _booking_time text, _booking_url text, _booking_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _rec record;
  _old_name text;
  _old_block text;
  _new_block text;
  _doc_id uuid;
BEGIN
  SELECT id, trip_id, name, type, booking_deadline, booking_time, booking_url, booking_note
    INTO _rec
    FROM public.recommendations
    WHERE id = _rec_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found or not accessible';
  END IF;

  _old_name := _rec.name;
  _old_block := public.booking_notes_block(_rec.booking_time, _rec.booking_url, _rec.booking_note);
  _new_block := public.booking_notes_block(_booking_time, _booking_url, _booking_note);

  UPDATE public.recommendations SET
    booking_time = NULLIF(btrim(_booking_time), ''),
    booking_url  = NULLIF(btrim(_booking_url), ''),
    booking_note = NULLIF(btrim(_booking_note), ''),
    booking_status = 'booked'
  WHERE id = _rec_id;

  INSERT INTO public.documents AS d (trip_id, title, type, notes, valid_date, linked_recommendation_id)
  VALUES (
    _rec.trip_id,
    _rec.name,
    CASE WHEN _rec.type = 'food' THEN 'other' ELSE 'attraction' END,
    _new_block,
    _rec.booking_deadline,
    _rec_id
  )
  ON CONFLICT (linked_recommendation_id) WHERE linked_recommendation_id IS NOT NULL
  DO UPDATE SET
    title = CASE
      WHEN d.title IS NOT DISTINCT FROM _old_name THEN EXCLUDED.title
      ELSE d.title
    END,
    notes = CASE
      WHEN d.notes IS NULL
        OR btrim(d.notes) = ''
        OR d.notes IS NOT DISTINCT FROM _old_block
      THEN EXCLUDED.notes
      ELSE d.notes
    END
  RETURNING d.id INTO _doc_id;

  IF _doc_id IS NULL THEN
    RAISE EXCEPTION 'Linked document could not be saved';
  END IF;
  RETURN _doc_id;
END
$$;

CREATE OR REPLACE FUNCTION public.documents_check_linked_rec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_recommendation_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.recommendations r
    WHERE r.id = NEW.linked_recommendation_id AND r.trip_id = NEW.trip_id
  ) THEN
    RAISE EXCEPTION 'Linked recommendation must belong to the same trip';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS documents_check_linked_rec ON public.documents;
CREATE TRIGGER documents_check_linked_rec
  BEFORE INSERT OR UPDATE OF linked_recommendation_id, trip_id ON public.documents
  FOR EACH ROW
  WHEN (NEW.linked_recommendation_id IS NOT NULL)
  EXECUTE FUNCTION public.documents_check_linked_rec();