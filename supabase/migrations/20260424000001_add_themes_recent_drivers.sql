ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS recent_drivers JSONB,
  ADD COLUMN IF NOT EXISTS recent_drivers_generated_at TIMESTAMPTZ;
