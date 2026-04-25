// Generates compressed bilingual short_headline / short_headline_zh for events
// using Claude Haiku 4.5. Idempotent — only processes rows where short_headline is null.
//
// Usage:
//   npx tsx scripts/backfill-event-short-headlines.ts            # full backfill
//   npx tsx scripts/backfill-event-short-headlines.ts --limit 50 # cap rows
//   npx tsx scripts/backfill-event-short-headlines.ts --dry-run  # no DB writes

import { config } from 'dotenv'
config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_FLAG = process.argv.indexOf('--limit')
const ROW_LIMIT = LIMIT_FLAG >= 0 ? parseInt(process.argv[LIMIT_FLAG + 1] ?? '0', 10) : 0
const BATCH_SIZE = 20
const CONCURRENCY = 3

interface EventRow {
  id: string
  headline: string
}

interface CompressedHeadline {
  en: string
  zh: string
}

const SYSTEM_PROMPT = `You compress US equity / macro news headlines into ultra-short bilingual labels for a compact UI timeline.

For each headline, produce:
- "en": ≤ 8 English words (≤ 50 chars). Lead with the entity (company / country / agency), then the action + magnitude. Drop filler ("announces that", "is reported to", date phrases, publisher names).
- "zh": ≤ 14 简体中文字符. Same logic. Keep ticker symbols / company names in English (e.g. "$NVDA", "SK Hynix"). Numbers stay as digits ("5x", "$41M", "23%").

Both must preserve the most market-moving fact: the entity, the action verb, and the key number/magnitude. Strip everything else.

Examples:
  "China's DeepSeek unveils V4 AI model in fresh challenge to US rivals"
    → en: "DeepSeek launches V4 AI model"
    → zh: "DeepSeek 发布 V4 模型"

  "Aehr Receives Record $41 Million Production Order from Lead Hyperscale AI Customer; Second-Half Bookings Exceed $92 Million"
    → en: "Aehr lands $41M AI order"
    → zh: "Aehr 获 $41M AI 大单"

  "SK Hynix Q1 profit jumps fivefold despite Middle East energy crisis"
    → en: "SK Hynix Q1 profit up 5x"
    → zh: "SK Hynix Q1 利润涨 5 倍"

If a headline is just a company name + SEC form type (e.g. "Acme Corp 8-K Filing") with no news content, still produce the best possible compressed label — e.g. en: "Acme files 8-K", zh: "Acme 提交 8-K". Never refuse, never return commentary, never skip an item.

Return JSON array — one object {"en":..., "zh":...} per input headline, in the same order. JSON only, no commentary.`

async function compressBatch(headlines: string[]): Promise<CompressedHeadline[]> {
  const { anthropic, MODEL_HAIKU } = await import('../lib/anthropic')
  const numbered = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Compress these ${headlines.length} headlines. Return a JSON array of ${headlines.length} objects in order.\n\n${numbered}`,
      },
    ],
  })
  const block = response.content[0]
  const text = block && block.type === 'text' ? block.text : ''
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error(`No JSON array in response: ${text.slice(0, 200)}`)
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as CompressedHeadline[]
  if (!Array.isArray(parsed) || parsed.length !== headlines.length) {
    throw new Error(`Expected ${headlines.length} items, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`)
  }
  return parsed
}

async function fetchPending(): Promise<EventRow[]> {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  // Supabase default cap is 1000 rows per select; page through with .range() so
  // big backfills (>1000 rows) don't silently truncate. Stop early if --limit set.
  const PAGE = 1000
  const out: EventRow[] = []
  for (let from = 0; ; from += PAGE) {
    const target = ROW_LIMIT > 0 ? Math.min(PAGE, ROW_LIMIT - out.length) : PAGE
    if (target <= 0) break
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('id, headline')
      .is('short_headline', null)
      .not('headline', 'is', null)
      .order('event_date', { ascending: false })
      .range(from, from + target - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as EventRow[]
    out.push(...rows)
    if (rows.length < target) break
  }
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function run() {
  const { supabaseAdmin } = await import('../lib/supabase-admin')
  const pLimit = (await import('p-limit')).default

  const pending = await fetchPending()
  console.log(`\n=== Event short_headline backfill ===`)
  console.log(`  pending events:  ${pending.length}`)
  console.log(`  batch size:      ${BATCH_SIZE}`)
  console.log(`  concurrency:     ${CONCURRENCY}`)
  console.log(`  dry run:         ${DRY_RUN}`)

  if (pending.length === 0) {
    console.log('\nNothing to do.')
    return
  }

  const limit = pLimit(CONCURRENCY)
  const batches = chunk(pending, BATCH_SIZE)
  let written = 0
  let failed = 0

  await Promise.all(
    batches.map((batch, batchIdx) =>
      limit(async () => {
        try {
          const compressed = await compressBatch(batch.map((e) => e.headline))
          for (let i = 0; i < batch.length; i++) {
            const c = compressed[i]
            if (!c?.en || !c?.zh) {
              failed++
              continue
            }
            if (DRY_RUN) {
              console.log(`  [dry] ${batch[i].id} → en="${c.en}" | zh="${c.zh}"`)
              continue
            }
            const { error } = await supabaseAdmin
              .from('events')
              .update({ short_headline: c.en, short_headline_zh: c.zh })
              .eq('id', batch[i].id)
            if (error) {
              console.error(`  update failed for ${batch[i].id}: ${error.message}`)
              failed++
            } else {
              written++
            }
          }
          console.log(`  batch ${batchIdx + 1}/${batches.length} done · written=${written} failed=${failed}`)
        } catch (err) {
          console.error(`  batch ${batchIdx + 1}/${batches.length} threw:`, err)
          failed += batch.length
        }
      })
    )
  )

  console.log(`\nDone. written=${written} failed=${failed} of ${pending.length}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
