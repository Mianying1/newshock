ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS conviction_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS conviction_score numeric,
  ADD COLUMN IF NOT EXISTS conviction_reasoning text,
  ADD COLUMN IF NOT EXISTS conviction_reasoning_zh text,
  ADD COLUMN IF NOT EXISTS conviction_generated_at timestamptz;
