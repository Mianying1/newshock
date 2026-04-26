-- Backup of ticker-pipeline-related tables before refactor (2026-04-25).
-- Idempotent: re-running is a no-op once the *_backup_20260425 tables exist.
-- Apply manually via Supabase Dashboard SQL editor.
--
-- Rollback procedure: see /tmp/ROLLBACK_TICKER_REFACTOR.sql

-- 1. theme_recommendations (核心表 · ticker tier / confidence)
CREATE TABLE IF NOT EXISTS theme_recommendations_backup_20260425 AS
SELECT * FROM theme_recommendations;

-- 2. themes (主题表 · strength / score)
CREATE TABLE IF NOT EXISTS themes_backup_20260425 AS
SELECT * FROM themes;

-- 3. tickers (ticker 主表)
CREATE TABLE IF NOT EXISTS tickers_backup_20260425 AS
SELECT * FROM tickers;

-- 4. event_scores (评分中间表 · 依赖 tier)
CREATE TABLE IF NOT EXISTS event_scores_backup_20260425 AS
SELECT * FROM event_scores;

-- 5. theme_archetypes (note: user spec said `archetypes` — actual table is `theme_archetypes`)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'theme_archetypes')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'theme_archetypes_backup_20260425')
  THEN
    EXECUTE 'CREATE TABLE theme_archetypes_backup_20260425 AS SELECT * FROM theme_archetypes';
  END IF;
END $$;

-- 6. theme_conviction (optional · may not exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'theme_conviction')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'theme_conviction_backup_20260425')
  THEN
    EXECUTE 'CREATE TABLE theme_conviction_backup_20260425 AS SELECT * FROM theme_conviction';
  END IF;
END $$;
