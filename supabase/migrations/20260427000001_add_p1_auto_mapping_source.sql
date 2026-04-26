-- Allow 'p1_auto_mapping' as a valid source on theme_recommendations.
-- Original CHECK accepts: manual, industry_retrieval, llm_auto.
-- This drops + recreates the constraint with the new value appended.
-- NULL source values remain accepted (CHECK passes on NULL by definition).

ALTER TABLE theme_recommendations
  DROP CONSTRAINT IF EXISTS theme_recs_source_check;

ALTER TABLE theme_recommendations
  ADD CONSTRAINT theme_recs_source_check
  CHECK (source IN (
    'manual',
    'industry_retrieval',
    'llm_auto',
    'p1_auto_mapping'
  ));
