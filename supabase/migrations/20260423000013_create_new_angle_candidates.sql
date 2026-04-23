CREATE TABLE IF NOT EXISTS new_angle_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  umbrella_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  trigger_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  angle_label TEXT NOT NULL,
  angle_description TEXT,
  proposed_tickers TEXT[],
  gap_reasoning TEXT,
  confidence NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (umbrella_theme_id, angle_label)
);

CREATE INDEX IF NOT EXISTS idx_nac_umbrella ON new_angle_candidates(umbrella_theme_id);
CREATE INDEX IF NOT EXISTS idx_nac_status ON new_angle_candidates(status);

ALTER TABLE new_angle_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_new_angle_candidates"
  ON new_angle_candidates FOR ALL TO service_role
  USING (true) WITH CHECK (true);
