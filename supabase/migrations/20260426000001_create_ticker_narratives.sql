-- D phase · ticker_narratives table
-- Stores LLM-generated bilingual narrative blocks per ticker.
-- Lazy-generated: API hits this table first; misses trigger LLM and write-back.
-- Schema mirrors front-end consumption shape:
--   narratives_json = {
--     en: { hero_line, top_themes, core_tension, why_benefits, risk_sources },
--     zh: { hero_line, top_themes, core_tension, why_benefits, risk_sources }
--   }
-- Validation lives in app code (zod) — JSONB lets us iterate prompt without DDL.

create table if not exists ticker_narratives (
  ticker_symbol      text primary key references tickers(symbol) on delete cascade,
  narratives_json    jsonb not null,
  generated_at       timestamptz not null default now(),
  input_hash         text not null,
  themes_signature   text not null,
  model_version      text not null,
  last_accessed_at   timestamptz not null default now()
);

-- Hot path: API reads narrative by ticker_symbol → already covered by PK.
-- Background job: find stale rows (generated_at older than TTL) for refresh.
create index if not exists ticker_narratives_generated_at_idx
  on ticker_narratives (generated_at desc);

-- Stale-detection by signature drift (themes membership changed).
create index if not exists ticker_narratives_signature_idx
  on ticker_narratives (themes_signature);

-- Access-frequency analysis (P1 / future cost optimization).
create index if not exists ticker_narratives_last_accessed_idx
  on ticker_narratives (last_accessed_at desc);

-- RLS: read-only for anon; service role writes only.
alter table ticker_narratives enable row level security;

drop policy if exists ticker_narratives_read on ticker_narratives;
create policy ticker_narratives_read
  on ticker_narratives for select
  using (true);

-- No INSERT/UPDATE policy = service role only (bypasses RLS).

comment on table ticker_narratives is
  'Bilingual LLM-generated ticker narrative blocks. Lazy-generated, cache via input_hash. See lib/ticker-narrative-generator.ts.';
comment on column ticker_narratives.input_hash is
  'sha256 of (symbol + active themes core fields + medium+ impact events 30d). Re-gen when changes.';
comment on column ticker_narratives.themes_signature is
  'sha256 of just (theme_id, status) tuples. Drift = active theme set changed → force refresh.';
comment on column ticker_narratives.model_version is
  'Format: "{model_id}-{prompt_version}", e.g. "claude-sonnet-4-6-v1". Bump prompt_version to invalidate cache.';
