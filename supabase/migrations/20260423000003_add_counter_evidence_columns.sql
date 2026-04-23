ALTER TABLE events
  ADD COLUMN IF NOT EXISTS supports_or_contradicts text,
  ADD COLUMN IF NOT EXISTS counter_evidence_reasoning text,
  ADD COLUMN IF NOT EXISTS counter_evidence_reasoning_zh text;
