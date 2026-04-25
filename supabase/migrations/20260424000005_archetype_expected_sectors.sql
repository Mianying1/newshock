-- 20260424000005 · Archetype expected_sectors + recommendation skip_reason
--
-- Adds two columns supporting the sector baseline check (subtask 20.1):
--   1. theme_archetypes.expected_sectors text[]  — sectors that legitimately
--      belong to the theme's archetype. Filled by LLM in a separate step.
--   2. theme_recommendations.skip_reason text    — populated when a rec is
--      pre-filtered by structural checks (e.g. sector mismatch). The rec
--      stays in the table for auditability but its confidence_band is set
--      to 'low' so the existing confidence floor hides it from the UI.

ALTER TABLE theme_archetypes
  ADD COLUMN IF NOT EXISTS expected_sectors text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN theme_archetypes.expected_sectors IS
  'Sectors a recommendation must come from to be considered legitimate. Empty array means "no gate" (legacy / not yet populated).';

ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS skip_reason text;

COMMENT ON COLUMN theme_recommendations.skip_reason IS
  'Set when a rec is auto-demoted by structural checks (e.g. sector_mismatch). Pairs with confidence_band=low.';
