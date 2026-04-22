-- =============================================================================
-- Newshock · Deep Recommendations
-- Migration: 20260422000010_deep_recommendations.sql
-- Adds rich reasoning columns to theme_recommendations + reflection to themes.
-- Forward-compatible: existing rows keep working with NULL in new columns.
-- =============================================================================

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS business_exposure     TEXT,
  ADD COLUMN IF NOT EXISTS business_exposure_zh  TEXT,
  ADD COLUMN IF NOT EXISTS catalyst              TEXT,
  ADD COLUMN IF NOT EXISTS catalyst_zh           TEXT,
  ADD COLUMN IF NOT EXISTS risk                  TEXT,
  ADD COLUMN IF NOT EXISTS risk_zh               TEXT,
  ADD COLUMN IF NOT EXISTS role_reasoning_zh     TEXT,
  ADD COLUMN IF NOT EXISTS market_cap_band       TEXT CHECK (market_cap_band IN ('small','mid','large')),
  ADD COLUMN IF NOT EXISTS is_pure_play          BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_often_missed       BOOLEAN,
  ADD COLUMN IF NOT EXISTS confidence            INT CHECK (confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS deep_version          TEXT,
  ADD COLUMN IF NOT EXISTS generated_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS theme_recs_often_missed_idx
  ON theme_recommendations (is_often_missed) WHERE is_often_missed = true;

ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS strategist_reflection     TEXT,
  ADD COLUMN IF NOT EXISTS strategist_reflection_zh  TEXT,
  ADD COLUMN IF NOT EXISTS deep_generated_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS themes_deep_generated_at_idx
  ON themes (deep_generated_at DESC NULLS LAST);
