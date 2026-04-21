ALTER TABLE theme_recommendations
ADD COLUMN IF NOT EXISTS exposure_direction TEXT
  CHECK (exposure_direction IN ('benefits', 'headwind', 'mixed', 'uncertain'))
  DEFAULT 'uncertain';
