-- Simplify the guard branch: the revise flag alone selects the location-only revision path.
CREATE OR REPLACE FUNCTION public.day_replace_proposals_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.in_day_proposal', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'day_replace_proposals can only be written by proposal functions';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF current_setting('app.in_day_proposal', true) IS DISTINCT FROM 'on'
       AND current_setting('app.in_day_proposal_revise', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'day_replace_proposals can only be written by proposal functions';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itinerary_days d WHERE d.id = NEW.day_id AND d.trip_id = NEW.trip_id) THEN
    RAISE EXCEPTION 'Proposal trip does not match day';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Proposal is final'; END IF;
    IF current_setting('app.in_day_proposal_revise', true) = 'on' THEN
      -- Location-only revision: every non-location field must be identical.
      IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.day_id <> OLD.day_id
         OR NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.created_by <> OLD.created_by
         OR NEW.entry_count <> OLD.entry_count OR NEW.fingerprint <> OLD.fingerprint
         OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at
         OR NEW.created_at <> OLD.created_at OR NEW.status IS DISTINCT FROM OLD.status
         OR NEW.request_id IS DISTINCT FROM OLD.request_id
         OR NEW.superseded_request_ids IS DISTINCT FROM OLD.superseded_request_ids
         OR jsonb_array_length(NEW.entries) <> jsonb_array_length(OLD.entries) THEN
        RAISE EXCEPTION 'Proposal content is immutable';
      END IF;
      IF NOT (SELECT bool_and(o.e - '{latitude,longitude,google_maps_url}'::text[]
                              = n.e - '{latitude,longitude,google_maps_url}'::text[])
              FROM jsonb_array_elements(OLD.entries) WITH ORDINALITY o(e,i)
              JOIN jsonb_array_elements(NEW.entries) WITH ORDINALITY n(e,i) USING (i)) THEN
        RAISE EXCEPTION 'Proposal content is immutable';
      END IF;
      IF NEW.location_sources IS DISTINCT FROM OLD.location_sources THEN
        IF OLD.location_sources IS NULL OR NEW.location_sources IS NULL
           OR array_length(NEW.location_sources, 1) IS DISTINCT FROM array_length(OLD.location_sources, 1) THEN
          RAISE EXCEPTION 'Proposal content is immutable';
        END IF;
        IF NOT (SELECT bool_and(o.s = n.s OR (o.s = 'missing' AND n.s IN ('existing','ai')))
                FROM unnest(OLD.location_sources) WITH ORDINALITY o(s,i)
                JOIN unnest(NEW.location_sources) WITH ORDINALITY n(s,i) USING (i)) THEN
          RAISE EXCEPTION 'Proposal content is immutable';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.id <> OLD.id OR NEW.trip_id <> OLD.trip_id OR NEW.day_id <> OLD.day_id
       OR NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.created_by <> OLD.created_by
       OR NEW.entries <> OLD.entries OR NEW.entry_count <> OLD.entry_count
       OR NEW.location_sources IS DISTINCT FROM OLD.location_sources
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.expires_at <> OLD.expires_at
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Proposal content is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $function$;