-- Add playbook JSONB column to theme_archetypes.
-- Apply manually via Supabase dashboard SQL editor (no exec_sql RPC in this project).
-- Once applied, migrate knowledge/playbooks/*.json → DB using:
--   UPDATE theme_archetypes SET playbook = '<json>'::jsonb WHERE id = '<id>';

ALTER TABLE theme_archetypes
ADD COLUMN IF NOT EXISTS playbook JSONB DEFAULT '{}'::jsonb;
