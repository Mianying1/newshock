-- Phase 3 · D3 follow-up: extend expected_sectors for 2 audit archetypes where
-- key tickers risk sector-mismatch downgrade (same failure mode as MSTR in
-- crypto_institutional_infrastructure, fixed in 20260425000012).
--
-- Targets:
--   middle_east_energy_shock           — add defense, aerospace
--     (LMT/RTX/NOC are direct beneficiaries of ME conflict but current sectors
--      list excludes defense/aerospace → LLM treats as out-of-scope)
--   global_defense_spending_super_cycle — add technology, software, cybersecurity
--     (PLTR/CYBR are core military-software plays; current list lacks software/
--      tech/cyber categories so they get downranked)
--
-- Idempotent: APPEND only · dedup-safe via != ALL filter.
--
-- Apply via Supabase Dashboard SQL editor.

-- ─── 1. middle_east_energy_shock · 7 → 9 (+defense, +aerospace) ───
UPDATE theme_archetypes
SET expected_sectors = COALESCE(expected_sectors, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT s FROM unnest(ARRAY[
      'defense',
      'aerospace'
    ]::text[]) AS s
    WHERE s != ALL(COALESCE(expected_sectors, ARRAY[]::text[]))
  )
)
WHERE id = 'middle_east_energy_shock';

-- ─── 2. global_defense_spending_super_cycle · 7 → 10 (+technology, +software, +cybersecurity) ───
UPDATE theme_archetypes
SET expected_sectors = COALESCE(expected_sectors, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT s FROM unnest(ARRAY[
      'technology',
      'software',
      'cybersecurity'
    ]::text[]) AS s
    WHERE s != ALL(COALESCE(expected_sectors, ARRAY[]::text[]))
  )
)
WHERE id = 'global_defense_spending_super_cycle';

-- ─── Post-apply verify (run separately) ───
-- SELECT id, cardinality(expected_sectors) AS n, expected_sectors
-- FROM theme_archetypes
-- WHERE id IN ('middle_east_energy_shock', 'global_defense_spending_super_cycle')
-- ORDER BY id;
-- expected counts: middle_east=9, global_defense=10
