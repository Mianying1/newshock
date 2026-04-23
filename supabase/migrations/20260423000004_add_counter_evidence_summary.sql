ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS counter_evidence_summary jsonb;
