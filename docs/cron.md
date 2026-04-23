# Cron Jobs

All crons are defined in `vercel.json` and protected by `CRON_SECRET` (Bearer auth).

## V1 Compute Chain (nightly · UTC 07:00–07:15)

Four compute jobs run in dependency order, staggered 5 minutes apart.

| Time (UTC) | Cron path | Source | Purpose |
|---|---|---|---|
| 07:00 | `/api/cron/compute-ticker-maturity` | `scripts/compute-ticker-maturity.ts` | Score each ticker's maturity across its themes (archetype breadth + active theme count + 90d events + avg strength) |
| 07:05 | `/api/cron/compute-cycle-stage` | `scripts/compute-cycle-stage.ts` | Classify each active theme's lifecycle stage (early/mid/late/exit); insert `theme_alerts` on stage change |
| 07:10 | `/api/cron/compute-ticker-type` | `scripts/compute-ticker-type.ts` | Classify `theme_recommendations.ticker_type` (core_hold / short_catalyst / golden_leap / watch) — **depends on maturity score + cycle stage** |
| 07:15 | `/api/cron/compute-sentiment-score` | `scripts/compute-sentiment-score.ts` | Compute each theme's sentiment score from supporting/contradicting events (30d window, 14d half-life); writes `themes.sentiment_score`, `dominant_sentiment`, `recent_signal_shift` |

Dependency: maturity → stage → type. Sentiment is independent but scheduled last for bandwidth. Each job is idempotent.

## Manual runs (CLI)

Every cron has a CLI entry via `tsx`. Useful for backfill, debugging, or local testing.

```bash
npx tsx scripts/compute-ticker-maturity.ts
npx tsx scripts/compute-cycle-stage.ts
npx tsx scripts/compute-ticker-type.ts
npx tsx scripts/compute-sentiment-score.ts
```

Scripts load `.env.local` via `dotenv/config`. They hit the same Supabase tables as the cron endpoints.

## Manual trigger (HTTP)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment>/api/cron/compute-ticker-maturity
```

Returns `{ ok: true, elapsed_ms, stats: {...} }`. Unauthorized requests get 401.

## Troubleshooting

- **401 unauthorized** — check `CRON_SECRET` matches the Vercel env var.
- **Timeout (>300s)** — `maxDuration = 300` on each route. If a batch genuinely needs longer, split by theme/ticker batch instead of raising the cap.
- **`ticker_type` looks stale** — it reads `current_cycle_stage` + `ticker_maturity_score`; confirm stage and maturity jobs ran first (check `themes.cycle_stage_computed_at` and `theme_recommendations.ticker_maturity_score`).
- **No `theme_alerts` row on stage change** — there's a 24h dedup window; an identical `(from_stage, to_stage)` within the past day is suppressed.
- **Hobby plan cron limit** — `vercel.json` currently has 20 crons.
