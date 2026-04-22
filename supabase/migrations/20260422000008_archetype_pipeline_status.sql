ALTER TABLE theme_archetypes
ADD COLUMN IF NOT EXISTS pipeline_status TEXT
  CHECK (pipeline_status IN ('pending', 'generating', 'ready', 'failed', 'partial')),
ADD COLUMN IF NOT EXISTS pipeline_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pipeline_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pipeline_error TEXT;

UPDATE theme_archetypes
SET pipeline_status = 'ready',
    pipeline_completed_at = NOW()
WHERE is_active = true
  AND playbook IS NOT NULL
  AND playbook != '{}'::jsonb;
