-- Phase 3 · D3: extend crypto_institutional_infrastructure.expected_sectors.
--
-- Retrieval-only probe (2026-04-25) confirmed MSTR is in must_have layer
-- (rank 36, score 72) but LLM downranked it after R2 prompt change. Root
-- cause: expected_sectors = [fintech, software, technology, etf] does not
-- include corporate BTC treasury or crypto exchanges, so LLM treats MSTR /
-- CME as sector-mismatch and demotes to T2/T3.
--
-- Fix: APPEND two sectors (corporate_btc_treasury, crypto_exchanges).
-- Existing 4 sectors preserved. Idempotent dedup-safe append.
--
-- Apply via Supabase Dashboard SQL editor.

UPDATE theme_archetypes
SET expected_sectors = COALESCE(expected_sectors, ARRAY[]::text[]) || (
  SELECT ARRAY(
    SELECT s FROM unnest(ARRAY[
      'corporate_btc_treasury',
      'crypto_exchanges'
    ]::text[]) AS s
    WHERE s != ALL(COALESCE(expected_sectors, ARRAY[]::text[]))
  )
)
WHERE id = 'crypto_institutional_infrastructure';

-- Verify (run separately):
-- SELECT id, expected_sectors FROM theme_archetypes
-- WHERE id = 'crypto_institutional_infrastructure';
-- expected: [fintech, software, technology, etf, corporate_btc_treasury, crypto_exchanges]
