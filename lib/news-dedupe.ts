import { SupabaseClient } from '@supabase/supabase-js'
import { FetchedNews } from './news-fetcher'

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const BATCH_SIZE = 30

// Remove items whose source_url already exists in the events table
export async function filterDuplicates(
  fetched: FetchedNews[],
  supabase: SupabaseClient
): Promise<FetchedNews[]> {
  if (fetched.length === 0) return []

  const urls = Array.from(new Set(fetched.map((f) => f.source_url).filter(Boolean)))
  const existingUrls = new Set<string>()

  // Batch to avoid PostgREST GET URL length limits
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('events')
      .select('source_url')
      .in('source_url', batch)

    if (error) {
      console.warn('[news-dedupe] WARNING: URL dedupe batch failed, skipping URL check:', error.message)
      return fetched
    }

    for (const r of data ?? []) {
      existingUrls.add((r as { source_url: string }).source_url)
    }
  }

  return fetched.filter((f) => !existingUrls.has(f.source_url))
}

// Secondary dedupe: catch same story with different URLs (e.g. Google News vs FT)
// Uses normalized headline hash against last `days` days of events
export async function filterOldDuplicates(
  fetched: FetchedNews[],
  supabase: SupabaseClient,
  days = 30
): Promise<FetchedNews[]> {
  if (fetched.length === 0) return []

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('headline')
    .gte('event_date', since)

  if (error) {
    console.warn('[news-dedupe] WARNING: headline dedupe query failed, skipping headline check:', error.message)
    return fetched
  }

  const existingHashes = new Set(
    (data ?? []).map((r: { headline: string }) => normalizeTitle(r.headline))
  )

  return fetched.filter((f) => !existingHashes.has(normalizeTitle(f.headline)))
}
