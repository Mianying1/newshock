-- Add per-dimension AI narrative to each regime snapshot. Shape:
--   { earnings: { en, zh }, valuation: { en, zh }, fed: { en, zh },
--     economic: { en, zh }, credit: { en, zh }, sentiment: { en, zh } }
ALTER TABLE market_regime_snapshots
  ADD COLUMN IF NOT EXISTS dimension_narratives JSONB;
