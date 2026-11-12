-- Guard trigger exactly as production (0012 definition) is loaded by run.sh before this file.
CREATE TRIGGER day_replace_proposals_guard BEFORE INSERT OR UPDATE ON public.day_replace_proposals
  FOR EACH ROW EXECUTE FUNCTION public.day_replace_proposals_guard();
INSERT INTO public.trips VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.itinerary_days VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.recommendations (trip_id, latitude, longitude) VALUES ('11111111-1111-4111-8111-111111111111', 35.0116, 135.7681);
-- Entries shaped like src/lib/day-proposals.server.ts: the four text keys are always present, often null.
SELECT set_config('app.in_day_proposal', 'on', false);
INSERT INTO public.day_replace_proposals (id, trip_id, day_id, created_by, entries, entry_count, fingerprint, location_sources, location_source_names) VALUES
 -- before fix: one stop with null fields, one without
 ('b0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"entry_type":"food","title":"Ramen","time_of_day":null,"location_name":null,"description":null,"icon_emoji":null}]', 1, 'FP', '{missing}', '{NULL}'),
 ('b0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"entry_type":"attraction","title":"Temple","time_of_day":"10:00","location_name":"Kyoto","description":"d","icon_emoji":"⛩"}]', 1, 'FP', '{missing}', '{NULL}'),
 -- after fix: same shapes, plus a stop that already has a location next to the missing one
 ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"entry_type":"note","title":"Hotel","time_of_day":null,"location_name":null,"description":null,"icon_emoji":null,"latitude":35.0,"longitude":135.0},{"entry_type":"food","title":"Ramen","time_of_day":null,"location_name":null,"description":null,"icon_emoji":null}]', 2, 'FP', '{ai,missing}', '{NULL,NULL}'),
 ('a0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"entry_type":"attraction","title":"Temple","time_of_day":"10:00","location_name":"Kyoto","description":"d","icon_emoji":"⛩"}]', 1, 'FP', '{missing}', '{NULL}');
SELECT set_config('app.in_day_proposal', '', false);
-- Returns the RPC result, or the raised error text.
CREATE FUNCTION public.t_revise(_id uuid, _locs jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.revise_day_proposal_locations(_id, 'FP', _locs)::text;
EXCEPTION WHEN others THEN RETURN 'ERROR: ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION public.t_revise(uuid, jsonb) TO authenticated;
