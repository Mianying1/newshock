-- Theme hierarchy: umbrella ↔ subtheme structure for /themes Map dashboard.
-- parent_theme_id: self-reference; null = top-level umbrella OR unclassified.
-- theme_tier: explicit tag so we can filter umbrellas without a self-join.
-- LLM backfill (lib/theme-tier.ts:classifySubthemeParent) writes these.

alter table themes
  add column if not exists parent_theme_id uuid references themes(id),
  add column if not exists theme_tier      text
    check (theme_tier in ('umbrella', 'subtheme'));

create index if not exists idx_themes_parent_id on themes(parent_theme_id);
create index if not exists idx_themes_tier      on themes(theme_tier);
