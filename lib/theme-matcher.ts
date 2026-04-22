/**
 * theme-matcher.ts
 * Loads the "existing context" (archetypes + active themes) for the Sonnet
 * theme-generation prompt, and caches it in memory for a short TTL so that
 * batch runs don't hammer Supabase with repeated identical queries.
 */

import {
  loadActiveArchetypes,
  loadActiveThemes,
  formatArchetypesForPrompt,
  formatActiveThemesForPrompt,
  type Archetype,
  type ActiveTheme,
} from './archetype-loader'
import { supabaseAdmin } from './supabase-admin'

export interface MatcherContext {
  archetypes: Archetype[]
  activeThemes: ActiveTheme[]
  availableTickers: string[]
  archetypesText: string
  activeThemesText: string
  tickersText: string
  loadedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — matches Anthropic ephemeral cache TTL

let _cache: MatcherContext | null = null

export async function getMatcherContext(forceRefresh = false): Promise<MatcherContext> {
  const now = Date.now()
  if (!forceRefresh && _cache && now - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache
  }

  const [archetypes, activeThemes, tickerData] = await Promise.all([
    loadActiveArchetypes(),
    loadActiveThemes(90),
    supabaseAdmin.from('tickers').select('symbol').eq('is_recommendation_candidate', true),
  ])

  const availableTickers = ((tickerData.data ?? []) as { symbol: string }[]).map((r) => r.symbol).sort()

  _cache = {
    archetypes,
    activeThemes,
    availableTickers,
    archetypesText: formatArchetypesForPrompt(archetypes),
    activeThemesText: formatActiveThemesForPrompt(activeThemes),
    tickersText: availableTickers.join(' '),
    loadedAt: now,
  }

  return _cache
}

/** Invalidate in-memory cache (call after inserting a new theme). */
export function invalidateMatcherCache(): void {
  _cache = null
}
