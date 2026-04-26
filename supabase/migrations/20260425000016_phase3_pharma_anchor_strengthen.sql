-- Phase 3 B.2 v2 · strengthen pharma_innovation_super_cycle anchor.
-- Dry-run after migration 15 still produced 0/7 mega caps in top 10.
-- LLM was reading exclusion_rule 1 (single GLP-1 trial results) as a blanket
-- veto on LLY/NVO themselves, and downranking mega caps for conglomerate
-- diversification.
--
-- Strategy: REPLACE the soft anchor sentence (added by migration 15) with a
-- CRITICAL SCORING GUIDANCE block that explicitly clarifies:
--   - mega caps MUST be Tier 1 anchors (70%+)
--   - the GLP-1 exclusion is event-level, not company-level
--   - small-caps and mega caps can coexist in top 10
--
-- Idempotent: REPLACE removes any prior anchor copy (matches both old and new),
-- then APPEND only if the strong-anchor marker is missing.
--
-- Apply via Supabase Dashboard SQL editor.

-- ─── Step A · remove the soft anchor inserted by migration 15 (if present) ───
UPDATE theme_archetypes
SET description = REPLACE(
  description,
  E'\n\nTier 1 candidates include both: (a) mega-cap incumbents capturing the convergence (LLY/NVO/MRK/JNJ/PFE/REGN/ABBV) AND (b) leveraged small-cap biotechs (precision-medicine/cell-gene). Don''t downrank mega-caps — they are super-cycle anchors with sustained R&D capex.',
  ''
)
WHERE id = 'pharma_innovation_super_cycle';

-- ─── Step B · append the strong-anchor block (idempotent) ───
UPDATE theme_archetypes
SET description = description || E'\n\nCRITICAL SCORING GUIDANCE for this archetype:\n\nThe mega-cap pharma anchors (LLY · NVO · MRK · JNJ · PFE · REGN · ABBV) MUST be evaluated as Tier 1 super-cycle beneficiaries (70%+ exposure) when scoring this theme · regardless of conglomerate diversification.\n\nIMPORTANT: The exclusion_rule about ''single GLP-1 trial results'' refers to event-level catalysts (don''t auto-trigger on one trial) · NOT to the companies themselves. LLY and NVO remain Tier 1 anchors due to broad super-cycle pipelines spanning GLP-1 · oncology · Alzheimer''s · gene therapy · etc.\n\nSmall/mid-cap biotechs (precision-medicine · cell-gene · single-asset) are leveraged plays · also Tier 1 if exposure is real. Both groups can coexist in top 10.'
WHERE id = 'pharma_innovation_super_cycle'
  AND description NOT LIKE '%CRITICAL SCORING GUIDANCE for this archetype%';

-- ─── Verify (run separately) ───
-- SELECT id, length(description) AS n_chars, description
-- FROM theme_archetypes
-- WHERE id = 'pharma_innovation_super_cycle';
-- expected: contains "CRITICAL SCORING GUIDANCE" exactly once · does NOT
--           contain old "(a) mega-cap incumbents capturing the convergence" line
