ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS cycle_stage_computed_at timestamptz;
