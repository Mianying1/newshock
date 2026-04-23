ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS previous_cycle_stage TEXT,
  ADD COLUMN IF NOT EXISTS previous_cycle_stage_at TIMESTAMPTZ;
