-- Phase 3 · D2: append exclusion_rules to 6 archetypes from LLM-generated set
-- (user-edited subset of /tmp/exclusion-rules-v1.json).
--
-- Idempotent: each UPDATE filters new rules against existing, only appending
-- those not already present. Re-running this migration is a no-op.
--
-- Apply via Supabase Dashboard SQL editor.

-- ─── 1. middle_east_energy_shock · 4 → 7 (+3) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude routine OPEC+ production quota announcements or monthly oil inventory reports — those belong to energy market fundamentals, not war premium',
      'Exclude oil price movements driven by U.S. shale production, global demand forecasts, or non-Middle-East supply events — route those to energy sector themes instead',
      'Exclude pipeline or refinery accidents in the Middle East unless directly caused by military action — operational incidents do not qualify as war premium catalysts'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'middle_east_energy_shock';

-- ─── 2. ai_capex_infrastructure · 7 → 9 (+2) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude co-packaged optics (CPO) or silicon photonics product launches — route to cpo_photonics_rotation theme',
      'Exclude inference-specific ASIC or edge AI chip announcements — those belong to ai_inference theme'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'ai_capex_infrastructure';

-- ─── 3. global_defense_spending_super_cycle · 0 → 5 (+5, Rule 4 rewritten) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude single-quarter defense contract awards or routine weapons procurement announcements — those belong to defense_buildup event-driven theme',
      'Exclude event-driven spikes from acute geopolitical crises (e.g., Taiwan Strait missile test, Ukraine invasion anniversary) — route to defense_buildup or geopolitical event themes',
      'Exclude defense contractor earnings beats or quarterly revenue guidance — those are stock-specific, not super-cycle structural shifts',
      'Exclude isolated single-country defense budget changes; super-cycle requires multi-year sustained rearmament evidence (US + at least one ally region: NATO/Asia/Middle East)',
      'Exclude drone or cyber-warfare tactical innovations without sustained procurement program evidence — tactical breakthroughs alone do not signal super-cycle capex'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'global_defense_spending_super_cycle';

-- ─── 4. pharma_innovation_super_cycle · 0 → 5 (+5) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude single GLP-1 trial results or obesity drug FDA approvals — those belong to obesity_drug_breakthrough theme',
      'Exclude individual biotech M&A deals or single-asset acquisitions — route to biotech sector or M&A themes unless part of multi-asset convergence narrative',
      'Exclude AI drug discovery software vendor product launches without pharma partnership or clinical validation — software tools alone do not signal pharma super-cycle',
      'Exclude quarterly pharma earnings beats or guidance raises — those are stock-specific, not super-cycle convergence signals',
      'Exclude generic drug approvals or biosimilar launches — those represent commoditization, not innovation super-cycle drivers'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'pharma_innovation_super_cycle';

-- ─── 5. defense_buildup · 3 → 7 (+4, dropped Rule 3 R&D-prototype) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude multi-year NATO/Asian/Middle Eastern defense budget super-cycle narratives or structural rearmament trend analysis — those belong to global_defense_spending_super_cycle theme',
      'Exclude routine defense contractor quarterly earnings, revenue guidance, or backlog reports without new contract awards — those are stock-specific, not buildup catalysts',
      'Exclude geopolitical tension escalation news (Taiwan Strait, Middle East conflict) without explicit defense spending or contract response — route to geopolitical event themes instead',
      'Exclude U.S. domestic infrastructure or non-military industrial spending even if contractors like LMT/RTX participate — defense_buildup requires military contract nexus'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'defense_buildup';

-- ─── 6. obesity_drug_breakthrough · 3 → 7 (+4, dropped Rule 5 non-GLP-1 mechanisms) ───
UPDATE theme_archetypes
SET exclusion_rules = COALESCE(exclusion_rules, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT r FROM unnest(ARRAY[
      'Exclude broad pharma innovation super-cycle narratives combining GLP-1 with AI drug discovery or cell/gene therapy — those belong to pharma_innovation_super_cycle theme',
      'Exclude general obesity or diabetes epidemiology studies, market size forecasts, or payer coverage policy debates without drug-specific clinical or regulatory news — those are sector background, not breakthrough catalysts',
      'Exclude quarterly earnings beats or sales guidance from LLY/NVO driven by existing GLP-1 drugs without new clinical data or indication expansion — route to pharma sector or earnings themes',
      'Exclude GLP-1 supply chain, manufacturing capacity, or API sourcing news without clinical or regulatory catalyst — those belong to pharma supply-chain themes'
    ]::text[]) AS r
    WHERE r != ALL(COALESCE(exclusion_rules, ARRAY[]::text[]))
  )
)
WHERE id = 'obesity_drug_breakthrough';

-- ─── Post-apply verify (run separately) ───
-- SELECT id, cardinality(exclusion_rules) AS n_rules
-- FROM theme_archetypes
-- WHERE id IN (
--   'middle_east_energy_shock', 'ai_capex_infrastructure',
--   'global_defense_spending_super_cycle', 'pharma_innovation_super_cycle',
--   'defense_buildup', 'obesity_drug_breakthrough'
-- ) ORDER BY id;
-- expected counts: middle_east=7, ai_capex=9, global_defense=5, pharma=5, defense_buildup=7, obesity=7
