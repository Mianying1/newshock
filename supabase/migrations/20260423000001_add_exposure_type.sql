ALTER TABLE theme_recommendations
  ADD COLUMN IF NOT EXISTS exposure_type text;
