-- ============================================================
-- Phase 1 · Ticker Industry Map (主库 + Watchlist + Archetype map)
-- ============================================================
-- Apply manually via Supabase Dashboard SQL editor (no exec_sql RPC).
-- Idempotent: safe to re-run.

-- 主库: 市值 ≥ $1B · 用于主题召回
CREATE TABLE IF NOT EXISTS ticker_industry_map (
  ticker varchar PRIMARY KEY,
  cik varchar,
  company_name text NOT NULL,

  -- SEC 数据
  sec_sic int,
  sec_sic_description text,

  -- FMP 数据
  fmp_industry text,
  fmp_sector text,
  fmp_sub_industry text,

  -- 多 bucket 支持
  industry_buckets text[] NOT NULL DEFAULT '{}',
  primary_bucket text NOT NULL,
  manual_override_reason text,

  -- Metadata
  market_cap bigint,
  exchange varchar,
  is_adr boolean DEFAULT false,
  source varchar NOT NULL,  -- 'auto_sec_fmp' / 'manual_override'
  fetched_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticker_industry_buckets ON ticker_industry_map USING GIN (industry_buckets);
CREATE INDEX IF NOT EXISTS idx_ticker_primary_bucket ON ticker_industry_map (primary_bucket);
CREATE INDEX IF NOT EXISTS idx_ticker_market_cap ON ticker_industry_map (market_cap DESC);

-- Watchlist: 市值 $100M - $1B · 不召回 · 仅记录
CREATE TABLE IF NOT EXISTS ticker_watchlist (
  ticker varchar PRIMARY KEY,
  cik varchar,
  company_name text NOT NULL,
  sec_sic int,
  sec_sic_description text,
  fmp_industry text,
  fmp_sector text,
  market_cap bigint,
  exchange varchar,
  fetched_at timestamp DEFAULT now(),
  promoted_to_main boolean DEFAULT false,
  promoted_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_watchlist_market_cap ON ticker_watchlist (market_cap DESC);

-- Archetype → bucket 映射(给 Phase 2 用)
CREATE TABLE IF NOT EXISTS archetype_bucket_map (
  archetype_name text NOT NULL,
  industry_bucket text NOT NULL,
  weight real DEFAULT 1.0,
  notes text,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (archetype_name, industry_bucket)
);
