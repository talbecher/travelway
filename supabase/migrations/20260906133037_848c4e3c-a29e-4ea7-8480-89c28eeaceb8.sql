ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS travel_pace TEXT NOT NULL DEFAULT 'balanced'
    CHECK (travel_pace IN ('relaxed','balanced','intensive')),
  ADD COLUMN IF NOT EXISTS travel_interests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS food_budget TEXT NOT NULL DEFAULT 'medium'
    CHECK (food_budget IN ('budget','medium','splurge')),
  ADD COLUMN IF NOT EXISTS travel_notes TEXT;