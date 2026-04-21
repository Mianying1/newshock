/**
 * Newshock · Knowledge Base Seed Script
 * Run: npx tsx scripts/seed.ts
 *
 * Uses service_role key — never import this file into frontend code.
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// ── Load env ──────────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const KNOWLEDGE = path.resolve(process.cwd(), "knowledge");

function readJsonFiles<T>(dir: string): T[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

function readJsonArrayFiles<T>(dir: string): { file: string; rows: T[] }[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  return files.map((f) => ({
    file: f,
    rows: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T[],
  }));
}

function isFkError(msg: string): string | null {
  const m = msg.match(/Key \(ticker_symbol\)=\(([^)]+)\)/);
  return m ? m[1] : null;
}

const counts = {
  theme_archetypes: 0,
  tickers: 0,
  // v1 不使用以下, 保留供 v2 复活
  patterns: 0,
  pattern_ticker_map: 0,
  pattern_ticker_map_skipped: 0,
  historical_instances: 0,
};

// ── Step 1: theme_archetypes (v1 primary) ────────────────────────────────────

async function seedThemeArchetypes() {
  const records = readJsonFiles<Record<string, unknown>>(
    path.join(KNOWLEDGE, "theme-archetypes")
  ).filter((r) => !("_draft" in r)); // skip any _draft files

  console.log(`\n[1/5] theme_archetypes — read ${records.length} files`);

  const { error } = await supabase
    .from("theme_archetypes")
    .upsert(records, { onConflict: "id" });

  if (error) {
    console.error("❌ theme_archetypes upsert failed:", error.message);
    process.exit(1);
  }

  counts.theme_archetypes = records.length;
  console.log(`     ✓ upserted ${records.length} theme_archetypes`);
}

// ── Step 1-legacy: patterns (v1 不使用, v2 可能复活) ─────────────────────────

async function seedPatterns() {
  const records = readJsonFiles<Record<string, unknown>>(
    path.join(KNOWLEDGE, "patterns")
  );
  console.log(`\n[legacy] patterns — read ${records.length} files (v1 skip)`);
  counts.patterns = records.length;
  // v1 不写入数据库, 仅统计文件数
}

// ── Step 2: tickers (v1 active) ──────────────────────────────────────────────

async function seedTickers() {
  const records = readJsonFiles<Record<string, unknown>>(
    path.join(KNOWLEDGE, "tickers")
  );
  console.log(`\n[2/5] tickers — read ${records.length} files`);

  const { error } = await supabase
    .from("tickers")
    .upsert(records, { onConflict: "symbol" });

  if (error) {
    console.error("❌ tickers upsert failed:", error.message);
    process.exit(1);
  }

  counts.tickers = records.length;
  console.log(`     ✓ upserted ${records.length} tickers`);
}

// ── Step 3: pattern_ticker_map (v1 不使用, v2 可能复活) ──────────────────────

async function seedMappings() {
  const files = readJsonArrayFiles<Record<string, unknown>>(
    path.join(KNOWLEDGE, "mappings")
  );
  console.log(`\n[legacy] pattern_ticker_map — read ${files.length} files (v1 skip)`);
  counts.pattern_ticker_map = 0; // v1 不写入
  counts.pattern_ticker_map_skipped = 0;
  return; // early return for v1 — v2: remove this return to re-enable below

  // eslint-disable-next-line no-unreachable
  let inserted = 0;
  let skipped = 0;

  for (const { file, rows } of files) {
    const valid = rows.filter((r) => r["ticker_symbol"] !== "__SELF__");
    const selfCount = rows.length - valid.length;
    skipped += selfCount;

    if (selfCount > 0) {
      console.log(`     ⚠  ${file}: skipped ${selfCount} __SELF__ placeholder(s)`);
    }

    if (valid.length === 0) continue;

    // Get the pattern_id for this file's rows and delete existing rows first
    const patternIds = Array.from(new Set(valid.map((r) => r["pattern_id"] as string)));
    for (const pid of patternIds) {
      const { error: delErr } = await supabase
        .from("pattern_ticker_map")
        .delete()
        .eq("pattern_id", pid);
      if (delErr) {
        console.error(`❌ Failed to clear pattern_ticker_map for ${pid}:`, delErr.message);
        process.exit(1);
      }
    }

    const { error } = await supabase.from("pattern_ticker_map").insert(valid);

    if (error) {
      const missing = isFkError(error.message);
      if (missing) {
        console.error(
          `❌ ticker_symbol '${missing}' 不在 tickers 表，请检查 knowledge/tickers/ 目录`
        );
      } else {
        console.error(`❌ pattern_ticker_map insert failed (${file}):`, error.message);
      }
      process.exit(1);
    }

    inserted += valid.length;
    console.log(`     ✓ ${file}: inserted ${valid.length} rows`);
  }

  counts.pattern_ticker_map = inserted;
  counts.pattern_ticker_map_skipped = skipped;
}

// ── Step 4: historical_instances (v1 不使用, v2 可能复活) ────────────────────

async function seedHistorical() {
  const files = readJsonArrayFiles<Record<string, unknown>>(
    path.join(KNOWLEDGE, "historical")
  );
  console.log(`\n[legacy] historical_instances — read ${files.length} files (v1 skip)`);
  counts.historical_instances = 0;
  return; // early return for v1
  void files;

  let inserted = 0;

  for (const { file, rows } of files) {
    if (rows.length === 0) {
      console.log(`     —  ${file}: empty, skipping`);
      continue;
    }

    // Clear existing rows for this pattern before re-inserting
    const patternId = rows[0]["pattern_id"] as string;
    const { error: delErr } = await supabase
      .from("historical_instances")
      .delete()
      .eq("pattern_id", patternId);

    if (delErr) {
      console.error(`❌ Failed to clear historical_instances for ${patternId}:`, delErr.message);
      process.exit(1);
    }

    const { error } = await supabase.from("historical_instances").insert(rows);

    if (error) {
      const missing = isFkError(error.message);
      if (missing) {
        console.error(
          `❌ ticker_symbol '${missing}' 不在 tickers 表，请检查 knowledge/tickers/ 目录`
        );
      } else {
        console.error(`❌ historical_instances insert failed (${file}):`, error.message);
      }
      process.exit(1);
    }

    inserted += rows.length;
    console.log(`     ✓ ${file}: inserted ${rows.length} rows`);
  }

  counts.historical_instances = inserted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log("════════════════════════════════════════");
  console.log("  Newshock · Knowledge Base Seed");
  console.log("════════════════════════════════════════");

  await seedThemeArchetypes();
  await seedTickers();
  await seedPatterns();      // legacy, no DB write
  await seedMappings();      // legacy, no DB write
  await seedHistorical();    // legacy, no DB write

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`
════════════════════════════════════════
  Seed Summary (v1)
════════════════════════════════════════
  theme_archetypes:      ${String(counts.theme_archetypes).padStart(2)} upserted  ← v1 active
  tickers:               ${String(counts.tickers).padStart(2)} upserted          ← v1 active
  patterns (legacy):     ${String(counts.patterns).padStart(2)} files (not written to DB)
  pattern_ticker_map:     0 (legacy, not written)
  historical_instances:   0 (legacy, not written)
────────────────────────────────────────
  Total time: ${elapsed}s
════════════════════════════════════════`);
}

main();
