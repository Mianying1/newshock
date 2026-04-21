-- =============================================================================
-- Newshock · Ticker Candidates
-- Migration: 20260421000002_ticker_candidates.sql
-- Tracks tickers suggested by Claude that are not yet in the tickers table.
-- Human reviews: promote to tickers | reject | keep pending.
-- =============================================================================

create table if not exists ticker_candidates (
  id             uuid primary key default gen_random_uuid(),
  symbol         text not null unique,

  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  mention_count  int not null default 1,

  -- Array of suggestion contexts, one entry per time Claude surfaced this symbol
  -- Shape: [{ event_id, theme_id, suggested_tier, role_reasoning, confidence, suggested_at }]
  contexts       jsonb not null default '[]'::jsonb,

  status         text not null default 'pending',
    -- pending | validated | rejected | promoted

  validation_notes  text,
  validated_at      timestamptz,
  promoted_at       timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_ticker_candidates_status
  on ticker_candidates (status);
create index if not exists idx_ticker_candidates_mention_count
  on ticker_candidates (mention_count desc);
create index if not exists idx_ticker_candidates_last_seen
  on ticker_candidates (last_seen_at desc);

alter table ticker_candidates enable row level security;

create policy "service_role_all" on ticker_candidates
  for all to service_role using (true) with check (true);
