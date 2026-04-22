# Newshock System State
Updated: 2026-04-22

## Active Systems
| System | Schedule | Notes |
|--------|----------|-------|
| **Ingest** (asia_eu) | Daily UTC 11:00 | |
| **Ingest** (eu_us_mid) | Daily UTC 17:00 | |
| **Ingest** (us_close) | Daily UTC 01:00 | |
| **Narrative generation** | Daily UTC 12:00 | |
| **Weekly market scan** | Mon+Thu UTC 16:00 | → archetype_candidates |
| **Theme cooling** | Daily UTC 03:00 | active→cooling @30d, cooling→archived @60d |

## Schema (current)
### themes
- `status` enum: `active` | `cooling` | `archived` | `exploratory_candidate` | `superseded`
- `first_event_at` TIMESTAMPTZ — date of first linked event
- `last_active_at` TIMESTAMPTZ — date of most recent linked event
- `days_hot` INTEGER — (last_event - first_event), frozen when cooling starts
- `days_since_last_event` — computed at query time from last_active_at (not stored)

### theme_archetypes
- `playbook` JSONB — 5-section schema: typical_duration, historical_cases, this_time_different, exit_signals + `duration_type` (bounded/extended/dependent) + `real_world_timeline`
- All names must be English (v1.1 naming rule)

### theme_recommendations
- `exposure_direction` — `benefits` | `headwind` | `mixed` | `uncertain`

### archetype_candidates
- `theme_group` TEXT — AI & Semi / Geopolitics / Critical Minerals / etc.
- `similarity_warnings` JSONB — [{type, target_id, target_name, similarity_score, reason, recommendation}]
- `overall_assessment` TEXT — unique / overlaps_existing / overlaps_candidate / should_merge

### tickers
- `logo_url` TEXT — fetched via FMP API

### market_narratives
- Generated daily by Sonnet from active themes

## Current Metrics (2026-04-22)
- **Archetypes active**: 39 (30 with playbook, 9 missing)
- **Themes**: 15 active / 0 cooling / 0 archived / 11 exploratory
- **Tickers**: 201 total / 172 with logo (86%)
- **Events**: 0 total (ingest not yet running — no API key connected)
- **Recommendations**: 163 (120 benefits / 15 headwind / 11 mixed / 17 uncertain)
- **Candidates**: 13 approved / 2 rejected / 0 pending

## Known Warnings (from health check)
- **9 archetypes missing playbook**: water_infrastructure_failure, radioisotope_supply_breakthrough, ai_inference_chip_race, ai_drug_design_validation, alzheimers_next_gen_therapeutics + 4 more
- **29 tickers without logo**: run `npx tsx scripts/fetch-ticker-logos.ts`
- **3 active themes should be cooling**: DRAM (113d), Ford-China (78d), Rare Earth (53d) — cron will fix at UTC 3 AM

## Known Unverified
- Weekly scan cron first auto-run: next Mon/Thu UTC 16:00
- Theme cooling cron first auto-run: tonight UTC 03:00
- v1.6 Step 5 UI recommendation badge: not tested with real pending candidates yet (0 pending)
- Events table empty: ingest pipeline requires news API keys to be connected

## Next Up
| Priority | Item |
|----------|------|
| P0 | **v1.7** · Auto-pipeline after approve (playbook + logo post-approve) |
| P0 | **Ingest** · Connect news API keys, verify event ingestion |
| P1 | **Playbook backfill** · Generate playbooks for 9 missing archetypes |
| P1 | **Logo backfill** · Fetch logos for 29 missing tickers |
| P1 | **v1.1.6** · SEC 8-K filter (deferred events) |
| P2 | **v1.5** · FMP price calibration for playbook |
| P2 | **v1.8+** · Exit signal active detection |
| P3 | **Theme dependency graph** · Parent-child for dependent archetypes |

## Commands
```bash
npm run health                                          # System state snapshot
npm run dev                                             # Local dev server

# Playbook management
npx tsx scripts/generate-archetype-playbooks.ts         # All archetypes
npx tsx scripts/generate-archetype-playbooks.ts --archetype=<id>  # Single
npx tsx scripts/sync-playbooks-to-db.ts                 # Push JSON → DB

# Data maintenance
npx tsx scripts/fetch-ticker-logos.ts                   # Fetch missing logos
npx tsx scripts/backfill-theme-last-event.ts            # Backfill days_hot
npx tsx scripts/rename-chinese-archetypes.ts            # Find/rename Chinese names

# Weekly scan workflow
npx tsx scripts/weekly-market-scan.ts                   # Manual scan → candidates
npx tsx scripts/analyze-candidates.ts                   # Dedup analysis
# → review at /admin/candidates

# After approving new archetypes
npx tsx scripts/generate-archetype-playbooks.ts --archetype=<id>
npx tsx scripts/sync-playbooks-to-db.ts
npx tsx scripts/fetch-ticker-logos.ts
```
