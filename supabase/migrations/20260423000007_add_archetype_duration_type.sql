ALTER TABLE theme_archetypes
  ADD COLUMN IF NOT EXISTS duration_type text;

UPDATE theme_archetypes
  SET duration_type = playbook->>'duration_type'
  WHERE duration_type IS NULL
    AND playbook ? 'duration_type';
