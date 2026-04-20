import { supabaseAdmin } from './supabase-admin'
import { fetchAllSources, SourceResult } from './news-fetcher'
import { filterDuplicates, filterOldDuplicates } from './news-dedupe'
import { NewsSlot } from './news-sources'

export interface IngestOptions {
  slot?: NewsSlot
  limit?: number
}

export interface IngestResult {
  slot: NewsSlot | undefined
  total_fetched: number
  new_inserted: number
  skipped_duplicates: number
  sources: SourceResult[]
  duration_ms: number
}

export async function runIngest(options: IngestOptions = {}): Promise<IngestResult> {
  const { slot, limit } = options
  const start = Date.now()

  console.log(`[ingest] Starting ingest slot=${slot ?? 'all'} limit=${limit ?? 'none'}`)

  // 1. Fetch
  const { items: fetched, sourceResults } = await fetchAllSources(slot)
  console.log(`[ingest] Fetched ${fetched.length} items across ${sourceResults.length} sources`)

  // 2. URL dedupe
  let deduped = await filterDuplicates(fetched, supabaseAdmin)
  console.log(`[ingest] After URL dedupe: ${deduped.length} items (removed ${fetched.length - deduped.length})`)

  // 3. Headline dedupe (handles same story, different URL)
  deduped = await filterOldDuplicates(deduped, supabaseAdmin)
  console.log(`[ingest] After headline dedupe: ${deduped.length} items`)

  const skipped_duplicates = fetched.length - deduped.length

  // 4. Apply limit
  if (limit && deduped.length > limit) {
    deduped = deduped.slice(0, limit)
    console.log(`[ingest] Limited to ${limit} items`)
  }

  // 5. Insert
  let new_inserted = 0
  if (deduped.length > 0) {
    const rows = deduped.map((item) => ({
      event_date: item.published_at.toISOString(),
      headline: item.headline,
      source_url: item.source_url,
      source_name: item.source_name,
      raw_content: item.raw_content || null,
      mentioned_tickers: item.mentioned_tickers.length > 0 ? item.mentioned_tickers : null,
      pattern_id: null,
      classification_confidence: null,
      classifier_reasoning: null,
    }))

    const { error } = await supabaseAdmin.from('events').insert(rows)
    if (error) {
      console.error('[ingest] Insert error:', error.message)
      throw new Error(`Insert failed: ${error.message}`)
    }
    new_inserted = rows.length
    console.log(`[ingest] Inserted ${new_inserted} new events`)
  } else {
    console.log('[ingest] Nothing new to insert')
  }

  const duration_ms = Date.now() - start

  return {
    slot,
    total_fetched: fetched.length,
    new_inserted,
    skipped_duplicates,
    sources: sourceResults,
    duration_ms,
  }
}
