# Newshock Project Rules

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Vercel 部署
- Claude API (Sonnet) for event classification
- Stripe for payments
- Resend for email

## Conventions
- Database tables: snake_case
- TypeScript variables: camelCase
- Routes: kebab-case
- All data fetching goes through /lib/queries/*
- All UI components based on shadcn/ui
- All DB changes require Supabase migration files
- Run `npm run lint` before every commit

## Knowledge Base Management
- Event patterns stored as JSON in /knowledge/patterns/
- Tickers stored as JSON in /knowledge/tickers/
- Backtest data in /knowledge/backtest_results/
- JSON files are git-tracked (source of truth)
- Seed scripts sync JSON → Supabase on deploy

## Product Rules (do not violate)
- No realtime push. Daily digest only.
- No social features. No leaderboards. No sharing P&L.
- No broker integration. No 1-click trading.
- Every recommendation must show historical failure rate visibly.
- Every page must include "Information tool, not investment advice" disclaimer.

## Before completing any task
- Update DECISIONS.md if a significant decision was made
- Commit with clear message describing what changed
