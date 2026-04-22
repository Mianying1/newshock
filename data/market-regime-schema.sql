-- Market Regime V1 · 6 dimension × 0-2 score = 0-12 total
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS market_regime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE UNIQUE NOT NULL,

  earnings_score INT NOT NULL CHECK (earnings_score >= 0 AND earnings_score <= 2),
  valuation_score INT NOT NULL CHECK (valuation_score >= 0 AND valuation_score <= 2),
  fed_score INT NOT NULL CHECK (fed_score >= 0 AND fed_score <= 2),
  economic_score INT NOT NULL CHECK (economic_score >= 0 AND economic_score <= 2),
  credit_score INT NOT NULL CHECK (credit_score >= 0 AND credit_score <= 2),
  sentiment_score INT NOT NULL CHECK (sentiment_score >= 0 AND sentiment_score <= 2),

  total_score INT NOT NULL CHECK (total_score >= 0 AND total_score <= 12),
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
