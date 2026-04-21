CREATE TABLE IF NOT EXISTS market_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  related_theme_ids UUID[] NOT NULL,
  aggregate_ticker_count INT,
  top_chokepoint_tickers TEXT[],
  generated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  valid_until TIMESTAMPTZ,
  rank INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_narratives_active
  ON market_narratives(is_active, rank)
  WHERE is_active = true;
