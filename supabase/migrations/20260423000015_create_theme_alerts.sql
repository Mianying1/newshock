CREATE TABLE IF NOT EXISTS theme_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  reason TEXT,
  ratio NUMERIC(5,3),
  days_since_first_event INT,
  severity TEXT NOT NULL DEFAULT 'info',
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theme_alerts_theme ON theme_alerts(theme_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_theme_alerts_unseen ON theme_alerts(created_at DESC) WHERE seen_at IS NULL;

ALTER TABLE theme_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_theme_alerts"
  ON theme_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);
