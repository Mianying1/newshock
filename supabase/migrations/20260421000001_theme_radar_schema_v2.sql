-- =============================================================================
-- Newshock · Theme Radar Schema v2
-- Migration: 20260421000001_theme_radar_schema_v2.sql
-- Adds classification_confidence to themes, exclusion_rules to theme_archetypes
-- =============================================================================

-- themes: Claude's confidence in the theme identification
alter table themes
  add column if not exists classification_confidence int default 50;

create index if not exists idx_themes_classification_confidence
  on themes (classification_confidence desc);

comment on column themes.classification_confidence is
  'Confidence (0-100) of Claude theme identification. Used to filter exploratory vs high-confidence themes in UI.';

-- theme_archetypes: heuristics to prevent false-positive matching
alter table theme_archetypes
  add column if not exists exclusion_rules text[];

comment on column theme_archetypes.exclusion_rules is
  'Heuristics for Claude to avoid false positives when matching news to this archetype.';
