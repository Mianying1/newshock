ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS sentiment_computed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dominant_sentiment TEXT,
  ADD COLUMN IF NOT EXISTS recent_signal_shift JSONB;
