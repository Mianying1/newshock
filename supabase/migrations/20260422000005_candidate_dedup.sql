ALTER TABLE archetype_candidates
ADD COLUMN IF NOT EXISTS theme_group TEXT,
ADD COLUMN IF NOT EXISTS similarity_warnings JSONB DEFAULT '[]'::jsonb;
