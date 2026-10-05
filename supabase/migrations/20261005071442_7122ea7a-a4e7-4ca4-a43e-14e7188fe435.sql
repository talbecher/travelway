CREATE OR REPLACE FUNCTION public._day_replace_rows(_day_id uuid)
RETURNS TABLE(id uuid, entry_type text, title text, time_of_day text, display_order integer,
  created_at timestamptz, linked_recommendation_id uuid, linked_hotel_id uuid,
  booking_status text, is_protected boolean, protect_reason text, row_sig text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, e.entry_type::text, e.title, e.time_of_day, e.display_order, e.created_at,
    e.linked_recommendation_id, e.linked_hotel_id, r.booking_status,
    (e.entry_type = 'hotel_checkin' OR COALESCE(r.booking_status = 'booked', false)) AS is_protected,
    CASE WHEN e.entry_type = 'hotel_checkin' THEN 'hotel'
         WHEN r.booking_status = 'booked' THEN 'booked' END AS protect_reason,
    concat_ws('|', e.id, e.entry_type, e.title, e.description, e.time_of_day, e.location_name,
      e.google_maps_url, e.icon_emoji, e.display_order, e.linked_recommendation_id, e.linked_hotel_id,
      e.latitude, e.longitude, e.photo_url, r.booking_status) AS row_sig
  FROM public.day_entries e
  JOIN public.itinerary_days d ON d.id = e.day_id
  LEFT JOIN public.recommendations r ON r.id = e.linked_recommendation_id AND r.trip_id = d.trip_id
  WHERE e.day_id = _day_id
  ORDER BY e.display_order, e.created_at, e.id
$$;