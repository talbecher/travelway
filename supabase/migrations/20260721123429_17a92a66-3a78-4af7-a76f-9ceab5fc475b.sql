CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('flight','hotel','attraction','insurance','visa','transport','other')),
  file_url TEXT,
  barcode_value TEXT,
  barcode_type TEXT CHECK (barcode_type IN ('qr','barcode128')),
  notes TEXT,
  amount_ils NUMERIC,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  valid_date DATE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip participants manage documents"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

CREATE INDEX idx_documents_trip ON public.documents(trip_id, display_order, created_at);