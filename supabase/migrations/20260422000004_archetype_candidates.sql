CREATE TABLE IF NOT EXISTS archetype_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_archetype_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  initial_tickers JSONB DEFAULT '[]'::jsonb,
  recent_events JSONB DEFAULT '[]'::jsonb,
  why_this_matters TEXT,
  estimated_importance TEXT CHECK (
    estimated_importance IN ('high', 'medium', 'low')
  ) DEFAULT 'medium',

  scan_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  reviewed_at TIMESTAMPTZ,

  generated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidates_status
  ON archetype_candidates(status, scan_date DESC);
