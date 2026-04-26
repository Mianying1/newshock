-- Phase 3 D · cleanup 3 active themes that have no archetype_id and blocked
-- the full-backfill run.
--
-- D.1 · Fed Leadership Transition · Policy Uncertainty
--       → assign existing archetype: fed_rate_cycle_transition
-- D.2 · DeFi Security Crisis · Institutional Trust Erosion
--       Bitcoin Momentum Breakout · Technical Trading Signal
--       → set status=archived (no matching archetype framework, deferred to backlog)
--
-- NOTE: themes table currently has NO archived_reason column. This migration
-- adds it (text, nullable) before populating. If you'd rather keep the schema
-- as-is, drop section D.0 and the archived_reason fields in D.2 — status alone
-- is sufficient to take the row out of active backfill scope.
--
-- Apply via Supabase Dashboard SQL editor.

-- ─── D.0 · add nullable archived_reason column (safe if absent) ───
ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- ─── D.1 · attach Fed Leadership Transition to fed_rate_cycle_transition ───
UPDATE themes
SET archetype_id = 'fed_rate_cycle_transition',
    updated_at = NOW()
WHERE name = 'Fed Leadership Transition · Policy Uncertainty'
  AND archetype_id IS NULL
  AND status = 'active';

-- ─── D.2 · archive 2 active no-archetype themes ───
UPDATE themes
SET status = 'archived',
    archived_reason = 'Short-term momentum theme · no matching archetype framework · deferred to backlog',
    updated_at = NOW()
WHERE name IN (
        'DeFi Security Crisis · Institutional Trust Erosion',
        'Bitcoin Momentum Breakout · Technical Trading Signal'
      )
  AND archetype_id IS NULL
  AND status = 'active';

-- ─── Verify (run separately) ───
-- SELECT id, name, status, archetype_id, archived_reason
-- FROM themes
-- WHERE name IN (
--   'Fed Leadership Transition · Policy Uncertainty',
--   'DeFi Security Crisis · Institutional Trust Erosion',
--   'Bitcoin Momentum Breakout · Technical Trading Signal'
-- );
-- expected:
--   Fed Leadership Transition  → status=active   archetype_id=fed_rate_cycle_transition
--   DeFi Security Crisis ITE   → status=archived archetype_id=null  archived_reason='Short-term...'
--   Bitcoin Momentum Breakout  → status=archived archetype_id=null  archived_reason='Short-term...'
