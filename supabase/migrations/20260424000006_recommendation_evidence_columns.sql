-- 20260424000006 · Recommendation evidence anchoring (subtask 20.2)
--
-- Adds two columns to support evidence-anchored ticker recommendations.
-- The pipeline now requires the LLM to cite specific event_ids from the
-- theme's event stream and name a concrete business_segment for each rec.
--
--   evidence_event_ids uuid[]  — events that justify the recommendation.
--                                Empty/missing → demoted to confidence_band='low'.
--   business_segment text       — specific line of business that ties the
--                                ticker to the theme (e.g. "AI Foundry only").

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS evidence_event_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS business_segment text;

COMMENT ON COLUMN theme_recommendations.evidence_event_ids IS
  'IDs of theme events the LLM cited as evidence for this rec. Empty → no concrete grounding (demote).';

COMMENT ON COLUMN theme_recommendations.business_segment IS
  'Specific line of business connecting the ticker to the theme (e.g. "Foundry only", "CPU side"). Disambiguates multi-segment companies.';
