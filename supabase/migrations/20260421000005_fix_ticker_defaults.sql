-- Set DEFAULT true for new ticker inserts so future migrations don't
-- accidentally insert tickers with null is_recommendation_candidate.
ALTER TABLE tickers
  ALTER COLUMN is_recommendation_candidate SET DEFAULT true;

-- Backfill any remaining null values (idempotent).
-- Note: existing false values (mega-cap exclusions: NVDA, AAPL, GOOGL, etc.)
-- are intentional and must NOT be overwritten.
UPDATE tickers
SET is_recommendation_candidate = true
WHERE is_recommendation_candidate IS NULL;
