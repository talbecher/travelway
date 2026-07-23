ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS linked_hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_linked_hotel_id_idx ON public.expenses(linked_hotel_id);