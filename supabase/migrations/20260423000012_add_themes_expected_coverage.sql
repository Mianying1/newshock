ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS expected_coverage JSONB,
  ADD COLUMN IF NOT EXISTS coverage_generated_at TIMESTAMPTZ;
