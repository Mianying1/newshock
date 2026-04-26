-- Phase 3 · D1: lower crypto_institutional_adoption.crypto/mining weight from
-- 0.7 (existing, set by an earlier insert) to 0.3 per spec — miners are an
-- indirect/proxy relationship, not a direct one.
--
-- Apply via Supabase Dashboard SQL editor.

UPDATE archetype_bucket_map
SET weight = 0.3,
    notes = 'BTC mining capacity loosely correlated with institutional crypto adoption (ETF flows · BTC price) — indirect proxy, low weight'
WHERE archetype_name = 'crypto_institutional_adoption'
  AND industry_bucket = 'crypto/mining';

-- Verify (run separately):
-- SELECT industry_bucket, weight, notes FROM archetype_bucket_map
-- WHERE archetype_name = 'crypto_institutional_adoption' AND industry_bucket = 'crypto/mining';
