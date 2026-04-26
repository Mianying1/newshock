import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import {
  computeInputHash,
  computeThemesSignature,
  fetchInputBundle,
  generateNarrative,
  isCacheFresh,
  readCache,
  touchAccessed,
  writeCache,
  MODEL_VERSION,
  type NarrativeJson,
  type NarrativeBlock,
} from '@/lib/ticker-narrative'

export const maxDuration = 45
export const dynamic = 'force-dynamic'

type Status = 'fresh' | 'stale_served' | 'no_active_themes' | 'unknown_ticker' | 'generated' | 'failed'

type Resp = {
  symbol: string
  locale: 'en' | 'zh'
  narrative: NarrativeBlock | null
  status: Status
  generated_at: string | null
  model_version: string | null
  ticker: { company_name: string | null; sector: string | null } | null
  active_theme_count: number
}

function pickBlock(narrative: NarrativeJson | null, locale: 'en' | 'zh'): NarrativeBlock | null {
  if (!narrative) return null
  return locale === 'zh' ? narrative.zh : narrative.en
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const sym = symbol.toUpperCase()
  const locale = (request.nextUrl.searchParams.get('locale') === 'zh' ? 'zh' : 'en') as 'en' | 'zh'

  let bundle: Awaited<ReturnType<typeof fetchInputBundle>> = null
  try {
    bundle = await fetchInputBundle(sym)
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'narrative_fetch_input', symbol: sym } })
    return Response.json(
      { symbol: sym, locale, narrative: null, status: 'failed', generated_at: null, model_version: null, ticker: null, active_theme_count: 0 } satisfies Resp,
      { status: 500 }
    )
  }
  if (!bundle) {
    return Response.json(
      { symbol: sym, locale, narrative: null, status: 'unknown_ticker', generated_at: null, model_version: null, ticker: null, active_theme_count: 0 } satisfies Resp,
      { status: 404 }
    )
  }
  const tickerInfo = { company_name: bundle.company_name, sector: bundle.sector }
  const activeThemeCount = bundle.themes.length

  // Case 0 — no active themes: skip LLM, do not write cache, return null narrative.
  if (bundle.themes.length === 0) {
    return Response.json(
      { symbol: sym, locale, narrative: null, status: 'no_active_themes', generated_at: null, model_version: null, ticker: tickerInfo, active_theme_count: 0 } satisfies Resp,
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    )
  }

  const inputHash = computeInputHash(bundle)
  const themesSig = computeThemesSignature(bundle.themes)
  const cached = await readCache(sym)

  if (cached && isCacheFresh(cached, inputHash, themesSig)) {
    touchAccessed(sym).catch(() => {})
    return Response.json(
      {
        symbol: sym,
        locale,
        narrative: pickBlock(cached.narratives_json, locale),
        status: 'fresh',
        generated_at: cached.generated_at,
        model_version: cached.model_version,
        ticker: tickerInfo,
        active_theme_count: activeThemeCount,
      } satisfies Resp,
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    )
  }

  // Stale or missing → regenerate. On LLM failure, fall back to stale cache when present.
  let fresh: NarrativeJson | null = null
  try {
    fresh = await generateNarrative(bundle)
  } catch (e) {
    Sentry.captureException(e, { tags: { stage: 'narrative_generate', symbol: sym } })
    if (cached) {
      // Soft-fail: return stale narrative; client should retry later.
      return Response.json(
        {
          symbol: sym,
          locale,
          narrative: pickBlock(cached.narratives_json, locale),
          status: 'stale_served',
          generated_at: cached.generated_at,
          model_version: cached.model_version,
          ticker: tickerInfo,
          active_theme_count: activeThemeCount,
        } satisfies Resp,
        { status: 200 }
      )
    }
    return Response.json(
      { symbol: sym, locale, narrative: null, status: 'failed', generated_at: null, model_version: null, ticker: tickerInfo, active_theme_count: activeThemeCount } satisfies Resp,
      { status: 502 }
    )
  }

  await writeCache(sym, fresh, inputHash, themesSig)
  return Response.json(
    {
      symbol: sym,
      locale,
      narrative: pickBlock(fresh, locale),
      status: 'generated',
      generated_at: new Date().toISOString(),
      model_version: MODEL_VERSION,
      ticker: tickerInfo,
      active_theme_count: activeThemeCount,
    } satisfies Resp,
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  )
}
