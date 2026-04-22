-- =============================================================================
-- Newshock · Recommendation Refinement
-- Migration: 20260422000011_recommendation_refinement.sql
-- Adds exposure_type / confidence_band / is_thematic_tool to theme_recommendations.
-- Used by the Refine pass to collapse deep recs into product-shaped 3-category view.
-- =============================================================================

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS exposure_type TEXT
    CHECK (exposure_type IN ('direct', 'observational', 'pressure'));

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS confidence_band TEXT
    CHECK (confidence_band IN ('high', 'medium', 'low'));

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS is_thematic_tool BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS theme_recs_exposure_type_idx
  ON theme_recommendations(exposure_type);
