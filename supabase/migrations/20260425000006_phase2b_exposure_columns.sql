-- Phase 2B · LLM-graded exposure columns on theme_recommendations.
-- Apply via Dashboard SQL editor (no exec_sql RPC).

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS exposure_pct       int,
  ADD COLUMN IF NOT EXISTS exposure_direction text,
  ADD COLUMN IF NOT EXISTS source             text,
  ADD COLUMN IF NOT EXISTS reasoning          text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'theme_recs_exposure_pct_range') THEN
    ALTER TABLE theme_recommendations
      ADD CONSTRAINT theme_recs_exposure_pct_range
      CHECK (exposure_pct IS NULL OR (exposure_pct BETWEEN 0 AND 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'theme_recs_source_check') THEN
    ALTER TABLE theme_recommendations
      ADD CONSTRAINT theme_recs_source_check
      CHECK (source IS NULL OR source IN ('industry_retrieval', 'llm_creative', 'manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'theme_recs_direction_check') THEN
    ALTER TABLE theme_recommendations
      ADD CONSTRAINT theme_recs_direction_check
      CHECK (exposure_direction IS NULL OR exposure_direction IN ('benefits', 'headwind', 'mixed', 'uncertain'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS theme_recs_exposure_pct_idx ON theme_recommendations (exposure_pct DESC);
