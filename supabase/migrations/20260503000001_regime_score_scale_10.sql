-- Market Regime scoring scale change: each dimension 0-2 → 0-10, total 0-12 → 0-60.
-- The table_constraint names below are Postgres' default for inline CHECK clauses
-- (`<table>_<column>_check`), generated when the table was created via
-- data/market-regime-schema.sql.

ALTER TABLE market_regime_snapshots
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_earnings_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_valuation_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_fed_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_economic_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_credit_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_sentiment_score_check,
  DROP CONSTRAINT IF EXISTS market_regime_snapshots_total_score_check;

ALTER TABLE market_regime_snapshots
  ADD CONSTRAINT market_regime_snapshots_earnings_score_check  CHECK (earnings_score  BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_valuation_score_check CHECK (valuation_score BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_fed_score_check       CHECK (fed_score       BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_economic_score_check  CHECK (economic_score  BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_credit_score_check    CHECK (credit_score    BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_sentiment_score_check CHECK (sentiment_score BETWEEN 0 AND 10),
  ADD CONSTRAINT market_regime_snapshots_total_score_check     CHECK (total_score     BETWEEN 0 AND 60);

-- Existing rows are on the 0-12 scale. Wipe them; the next cron run produces a
-- fresh 0-60 snapshot. (We have only 1-2 rows in this table anyway.)
TRUNCATE market_regime_snapshots;
