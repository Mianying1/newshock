-- Theme-specific historical playbook override.
-- Falls back to theme_archetypes.playbook when null (see lib/recommendation-builder.ts).
-- Schema mirrors theme_archetypes.playbook (ArchetypePlaybook in types/recommendations.ts)
-- so the UI read path stays unchanged.

alter table themes
  add column if not exists specific_playbook         jsonb,
  add column if not exists specific_playbook_zh      jsonb,
  add column if not exists specific_playbook_generated_at timestamptz;

create index if not exists themes_specific_playbook_pending_idx
  on themes (last_active_at desc)
  where specific_playbook is null and status = 'active';
