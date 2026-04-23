ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS current_cycle_stage text;
