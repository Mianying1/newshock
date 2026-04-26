-- Phase 3 · B.2: populate exclusion_rules for crypto_institutional_infrastructure.
-- After A.3 retag, miners have crypto/mining as primary/sole bucket so they no
-- longer recall into this archetype via bucket overlap. These rules are belt-and-
-- suspenders for the LLM in case any miner sneaks back in (e.g. via shared
-- secondary buckets like CORZ's tech/software).
--
-- Apply via Supabase Dashboard SQL editor.

UPDATE theme_archetypes
SET exclusion_rules = ARRAY[
  'Exclude pure-play crypto miners (MARA · RIOT · HUT · WULF · CIFR · IREN · BTDR · CLSK) - they belong to mining/hashrate theme not institutional infrastructure',
  'Exclude individual crypto tokens / coins / DAOs',
  'Exclude unregulated foreign crypto exchanges with no US institutional access'
]
WHERE id = 'crypto_institutional_infrastructure';

-- Verify (run separately):
-- SELECT id, exclusion_rules FROM theme_archetypes WHERE id = 'crypto_institutional_infrastructure';
