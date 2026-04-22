-- =============================================================================
-- Newshock · Coverage Audit Reports
-- Migration: 20260422000009_coverage_audit_reports.sql
-- AI-produced weekly audit of the archetype library.
-- =============================================================================

CREATE TABLE IF NOT EXISTS coverage_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,

  -- AI suggestions (three buckets)
  suggested_new_archetypes JSONB DEFAULT '[]'::jsonb,
  suggested_mergers        JSONB DEFAULT '[]'::jsonb,
  suggested_rebalancing    JSONB DEFAULT '[]'::jsonb,

  -- Context snapshot at the time of the audit
  active_archetype_count   INT,
  unmatched_events_count   INT,
  market_regime_label      TEXT,
  market_regime_score      INT,

  -- Sonnet reasoning
  overall_assessment       TEXT,
  overall_assessment_zh    TEXT,

  -- Admin workflow
  admin_reviewed_at        TIMESTAMPTZ,
  admin_notes              TEXT,
  actions_taken            JSONB DEFAULT '[]'::jsonb,

  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coverage_audit_date
  ON coverage_audit_reports(report_date DESC);

ALTER TABLE coverage_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_coverage_audit"
  ON coverage_audit_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);
