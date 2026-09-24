UPDATE public.settings
SET base_currency = 'ILS'
WHERE base_currency IS NULL OR base_currency = '';

INSERT INTO public.settings (trip_id, base_currency, foreign_currency)
SELECT t.id, 'ILS', COALESCE(NULLIF(t.currency_code, ''), 'ILS')
FROM public.trips t
WHERE NOT EXISTS (SELECT 1 FROM public.settings s WHERE s.trip_id = t.id)
ON CONFLICT (trip_id) DO NOTHING;