-- Task 23 Phase A · rule-based exit-signal trigger detection.
-- Stores per-theme, per-signal status so the UI can show ✓ triggered / ⚠ monitoring / - manual review.
-- Refreshed nightly by scripts/detect-exit-signal-triggers.ts (and /api/cron/check-exit-signals).
-- archetype_id is TEXT because theme_archetypes.id is TEXT (not uuid).

create table if not exists theme_exit_signal_triggers (
  id                  uuid primary key default gen_random_uuid(),
  theme_id            uuid not null references themes(id) on delete cascade,
  archetype_id        text not null,
  signal_index        integer not null,
  signal_text         text not null,
  trigger_rule_type   text not null check (trigger_rule_type in ('event_count', 'stale', 'manual_review')),
  trigger_status      text not null check (trigger_status in ('not_triggered', 'triggered', 'manual_review')),
  triggered_at        timestamptz,
  triggered_evidence  jsonb,
  last_checked_at     timestamptz not null default now(),
  unique (theme_id, signal_index)
);

create index if not exists idx_theme_exit_signal_triggers_theme on theme_exit_signal_triggers(theme_id);
create index if not exists idx_theme_exit_signal_triggers_status on theme_exit_signal_triggers(trigger_status);
