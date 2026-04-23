ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS ticker_type text;
