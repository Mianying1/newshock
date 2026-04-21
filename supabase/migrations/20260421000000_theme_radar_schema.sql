-- =============================================================================
-- Newshock · Theme Radar Schema
-- Migration: 20260421000000_theme_radar_schema.sql
-- Adds 3 new tables + alters events. Does NOT drop any existing tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. theme_archetypes
-- ---------------------------------------------------------------------------

create table if not exists theme_archetypes (
  id                        text primary key,
  name                      text not null,
  category                  text not null,
  description               text,
  trigger_keywords          text[] not null,
  typical_tickers           jsonb,
  typical_duration_days_min int,
  typical_duration_days_max int,
  is_active                 boolean not null default true,
  created_by                text not null default 'manual_v1',
  confidence_level          text not null default 'high',
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists theme_archetypes_category_idx on theme_archetypes (category);
create index if not exists theme_archetypes_is_active_idx on theme_archetypes (is_active);

create trigger theme_archetypes_updated_at
  before update on theme_archetypes
  for each row execute function update_updated_at();

alter table theme_archetypes enable row level security;

create policy "service_role_all" on theme_archetypes
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. themes
-- ---------------------------------------------------------------------------

create table if not exists themes (
  id                       uuid primary key default gen_random_uuid(),
  archetype_id             text references theme_archetypes(id) on delete set null,
  name                     text not null,
  status                   text not null default 'active',
  institutional_awareness  text not null default 'hidden',
  theme_strength_score     int not null default 50,
  first_seen_at            timestamptz not null default now(),
  last_active_at           timestamptz not null default now(),
  event_count              int not null default 0,
  summary                  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists themes_status_idx       on themes (status);
create index if not exists themes_archetype_idx    on themes (archetype_id);
create index if not exists themes_last_active_idx  on themes (last_active_at desc);

create trigger themes_updated_at
  before update on themes
  for each row execute function update_updated_at();

alter table themes enable row level security;

create policy "service_role_all" on themes
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. theme_recommendations
-- ---------------------------------------------------------------------------

create table if not exists theme_recommendations (
  id                  uuid primary key default gen_random_uuid(),
  theme_id            uuid not null references themes(id) on delete cascade,
  ticker_symbol       text not null references tickers(symbol),
  tier                int not null check (tier in (1, 2, 3)),
  role_reasoning      text,
  added_at            timestamptz not null default now(),
  last_confirmed_at   timestamptz not null default now(),
  unique (theme_id, ticker_symbol)
);

create index if not exists theme_recs_theme_idx   on theme_recommendations (theme_id);
create index if not exists theme_recs_ticker_idx  on theme_recommendations (ticker_symbol);
create index if not exists theme_recs_tier_idx    on theme_recommendations (tier);

alter table theme_recommendations enable row level security;

create policy "service_role_all" on theme_recommendations
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4. ALTER events — add trigger_theme_id (keep pattern_id untouched)
-- ---------------------------------------------------------------------------

alter table events
  add column if not exists trigger_theme_id uuid references themes(id) on delete set null;

create index if not exists events_trigger_theme_idx on events (trigger_theme_id);
