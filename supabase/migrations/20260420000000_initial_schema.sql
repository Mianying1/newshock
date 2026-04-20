-- =============================================================================
-- Newshock · Initial Schema
-- Migration: 20260420000000_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- KNOWLEDGE BASE LAYER
-- ---------------------------------------------------------------------------

-- (a) patterns
create table patterns (
  id                   text primary key,
  name                 text not null,
  description          text,
  trigger_keywords     text[],
  min_deal_size_usd_b  numeric,
  causal_chain         text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger patterns_updated_at
  before update on patterns
  for each row execute function update_updated_at();

-- (b) tickers
create table tickers (
  symbol           text primary key,
  company_name     text,
  sector           text,
  market_cap_usd_b numeric,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger tickers_updated_at
  before update on tickers
  for each row execute function update_updated_at();

-- (c) pattern_ticker_map
create table pattern_ticker_map (
  id             uuid primary key default gen_random_uuid(),
  pattern_id     text not null references patterns(id) on delete cascade,
  ticker_symbol  text not null references tickers(symbol) on delete cascade,
  tier           int  not null check (tier in (1, 2, 3)),
  reasoning      text,
  created_at     timestamptz not null default now(),
  unique (pattern_id, ticker_symbol)
);

-- ---------------------------------------------------------------------------
-- DYNAMIC DATA LAYER
-- ---------------------------------------------------------------------------

-- (d) events
create table events (
  id                        uuid primary key default gen_random_uuid(),
  event_date                timestamptz not null,
  headline                  text not null,
  source_url                text,
  source_name               text,
  raw_content               text,
  pattern_id                text references patterns(id) on delete set null,
  classification_confidence numeric check (classification_confidence between 0 and 1),
  mentioned_tickers         text[],
  classifier_reasoning      text,
  created_at                timestamptz not null default now()
);

create index events_pattern_date_idx on events (pattern_id, event_date desc);
create index events_date_idx         on events (event_date desc);

-- (e) event_scores
create table event_scores (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  ticker_symbol    text not null references tickers(symbol) on delete cascade,
  tier             int,
  score            int check (score between 0 and 100),
  score_breakdown  jsonb,
  run_id           text,
  computed_at      timestamptz not null default now()
);

create index event_scores_event_score_idx on event_scores (event_id, score desc);

-- (f) historical_instances
create table historical_instances (
  id                uuid primary key default gen_random_uuid(),
  pattern_id        text not null references patterns(id) on delete cascade,
  instance_date     date not null,
  event_name        text,
  source_url        text,
  tier_1_reactions  jsonb,
  tier_2_reactions  jsonb,
  notes             text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- USER LAYER
-- ---------------------------------------------------------------------------

-- (g) profiles
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  subscription_tier   text not null default 'free' check (subscription_tier in ('free', 'pro')),
  stripe_customer_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- auto-create profile when a new auth user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- (h) user_watchlist
create table user_watchlist (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  ticker_symbol  text not null references tickers(symbol) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (user_id, ticker_symbol)
);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

-- ── Knowledge Base tables: authenticated read-only; writes via service_role ──

alter table patterns            enable row level security;
alter table tickers             enable row level security;
alter table pattern_ticker_map  enable row level security;
alter table events              enable row level security;
alter table event_scores        enable row level security;
alter table historical_instances enable row level security;

-- patterns
create policy "patterns: authenticated can read"
  on patterns for select
  to authenticated
  using (true);

create policy "patterns: service_role can insert"
  on patterns for insert
  to service_role
  with check (true);

create policy "patterns: service_role can update"
  on patterns for update
  to service_role
  using (true) with check (true);

create policy "patterns: service_role can delete"
  on patterns for delete
  to service_role
  using (true);

-- tickers
create policy "tickers: authenticated can read"
  on tickers for select
  to authenticated
  using (true);

create policy "tickers: service_role can insert"
  on tickers for insert
  to service_role
  with check (true);

create policy "tickers: service_role can update"
  on tickers for update
  to service_role
  using (true) with check (true);

create policy "tickers: service_role can delete"
  on tickers for delete
  to service_role
  using (true);

-- pattern_ticker_map
create policy "pattern_ticker_map: authenticated can read"
  on pattern_ticker_map for select
  to authenticated
  using (true);

create policy "pattern_ticker_map: service_role can insert"
  on pattern_ticker_map for insert
  to service_role
  with check (true);

create policy "pattern_ticker_map: service_role can update"
  on pattern_ticker_map for update
  to service_role
  using (true) with check (true);

create policy "pattern_ticker_map: service_role can delete"
  on pattern_ticker_map for delete
  to service_role
  using (true);

-- events
create policy "events: authenticated can read"
  on events for select
  to authenticated
  using (true);

create policy "events: service_role can insert"
  on events for insert
  to service_role
  with check (true);

create policy "events: service_role can update"
  on events for update
  to service_role
  using (true) with check (true);

create policy "events: service_role can delete"
  on events for delete
  to service_role
  using (true);

-- event_scores
create policy "event_scores: authenticated can read"
  on event_scores for select
  to authenticated
  using (true);

create policy "event_scores: service_role can insert"
  on event_scores for insert
  to service_role
  with check (true);

create policy "event_scores: service_role can update"
  on event_scores for update
  to service_role
  using (true) with check (true);

create policy "event_scores: service_role can delete"
  on event_scores for delete
  to service_role
  using (true);

-- historical_instances
create policy "historical_instances: authenticated can read"
  on historical_instances for select
  to authenticated
  using (true);

create policy "historical_instances: service_role can insert"
  on historical_instances for insert
  to service_role
  with check (true);

create policy "historical_instances: service_role can update"
  on historical_instances for update
  to service_role
  using (true) with check (true);

create policy "historical_instances: service_role can delete"
  on historical_instances for delete
  to service_role
  using (true);

-- ── profiles: users access own row only ──

alter table profiles enable row level security;

create policy "profiles: user can read own row"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: user can update own row"
  on profiles for update
  to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- INSERT is handled by the handle_new_user trigger (security definer),
-- so no INSERT policy is needed for the authenticated role.

create policy "profiles: service_role full access"
  on profiles for all
  to service_role
  using (true) with check (true);

-- ── user_watchlist: users access own rows only ──

alter table user_watchlist enable row level security;

create policy "user_watchlist: user can read own rows"
  on user_watchlist for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_watchlist: user can insert own rows"
  on user_watchlist for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_watchlist: user can update own rows"
  on user_watchlist for update
  to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_watchlist: user can delete own rows"
  on user_watchlist for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Additional indexes & schema amendments
-- ---------------------------------------------------------------------------

create unique index event_scores_unique
  on event_scores (event_id, ticker_symbol, run_id);

create index event_scores_latest_idx
  on event_scores (event_id, computed_at desc);

alter table profiles add column deleted_at timestamptz;
