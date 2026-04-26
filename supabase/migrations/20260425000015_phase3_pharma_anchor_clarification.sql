-- Phase 3 B.2 · clarify pharma_innovation_super_cycle.description so the LLM
-- treats mega-cap incumbents as Tier 1 anchors alongside leveraged biotechs.
-- Backfill (2026-04-25 run) showed top 10 was 100% small/mid-cap biotechs and
-- LLY/JNJ/ABBV/MRK/PFE/REGN were all missing — likely because the LLM read
-- "super-cycle" as "structural multi-year leveraged play" and demoted megas.
--
-- NOTE: theme_archetypes primary key is `id`, not `archetype_id`. Spec used
-- archetype_id but the actual column is id — using id below.
--
-- Idempotent: only appends if the anchor sentence is not already present.
--
-- Apply via Supabase Dashboard SQL editor.

UPDATE theme_archetypes
SET description = description || E'\n\nTier 1 candidates include both: (a) mega-cap incumbents capturing the convergence (LLY/NVO/MRK/JNJ/PFE/REGN/ABBV) AND (b) leveraged small-cap biotechs (precision-medicine/cell-gene). Don''t downrank mega-caps — they are super-cycle anchors with sustained R&D capex.'
WHERE id = 'pharma_innovation_super_cycle'
  AND description NOT LIKE '%super-cycle anchors with sustained R&D capex%';

-- ─── Verify (run separately) ───
-- SELECT id, description FROM theme_archetypes
-- WHERE id = 'pharma_innovation_super_cycle';
-- expected: description ends with the anchor sentence
