-- Market Regime V2 · 6 dimensions × 0-10 score = 0-60 total
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS market_regime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE UNIQUE NOT NULL,

  earnings_score INT NOT NULL CHECK (earnings_score BETWEEN 0 AND 10),
  valuation_score INT NOT NULL CHECK (valuation_score BETWEEN 0 AND 10),
  fed_score INT NOT NULL CHECK (fed_score BETWEEN 0 AND 10),
  economic_score INT NOT NULL CHECK (economic_score BETWEEN 0 AND 10),
  credit_score INT NOT NULL CHECK (credit_score BETWEEN 0 AND 10),
  sentiment_score INT NOT NULL CHECK (sentiment_score BETWEEN 0 AND 10),

  total_score INT NOT NULL CHECK (total_score BETWEEN 0 AND 60),
  regime_label TEXT NOT NULL,
  configuration_guidance TEXT,

  earnings_reasoning TEXT,
  valuation_reasoning TEXT,
  fed_reasoning TEXT,
  economic_reasoning TEXT,
  credit_reasoning TEXT,
  sentiment_reasoning TEXT,

  raw_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_regime_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator TEXT NOT NULL,
  date DATE NOT NULL,
  value NUMERIC,
  change_mom NUMERIC,
  change_yoy NUMERIC,
  UNIQUE(indicator, date)
);

CREATE INDEX IF NOT EXISTS idx_market_regime_series ON market_regime_series (indicator, date DESC);
CREATE INDEX IF NOT EXISTS idx_market_regime_snapshots_date ON market_regime_snapshots (snapshot_date DESC);
