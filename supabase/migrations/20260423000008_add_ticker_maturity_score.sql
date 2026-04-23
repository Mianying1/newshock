ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS ticker_maturity_score numeric(4,2);
