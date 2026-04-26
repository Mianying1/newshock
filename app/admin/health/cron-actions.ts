'use server'

import { headers } from 'next/headers'

// TODO: 需要扩展 API 支持任意 cron · 当前只复用 /api/admin/trigger-cron 的固定 ingest + theme-generation 逻辑
//
// Production safety: gated behind NODE_ENV === 'development' because /admin/* has
// no access control yet. Triggering ingest in prod from any authenticated browser
// session would let anyone with the URL hit the pipeline. Re-enable by adding
// admin auth middleware first.
export async function runIngestAndThemeGen(): Promise<{
  ok: boolean
  message?: string
  error?: string
}> {
  if (process.env.NODE_ENV !== 'development') {
    return { ok: false, error: 'Manual cron triggers disabled in production' }
  }
  const h = headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  const secret = process.env.ADMIN_SECRET
  if (!secret) return { ok: false, error: 'ADMIN_SECRET not configured' }
  if (!host) return { ok: false, error: 'host header missing' }

  try {
    const res = await fetch(`${proto}://${host}/api/admin/trigger-cron`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      const msg = (json.message as string) ?? (json.error as string) ?? `HTTP ${res.status}`
      return { ok: false, error: msg }
    }
    const ingest = json.ingest as { new_inserted?: number; skipped_duplicates?: number } | undefined
    const tg = json.theme_generation as
      | { themes_created?: number; strengthen?: number; new_exploratory?: number }
      | undefined
    const ms = (json.duration_ms as number) ?? 0
    return {
      ok: true,
      message: `+${ingest?.new_inserted ?? 0} events · ${tg?.themes_created ?? 0} themes (${tg?.strengthen ?? 0} 强化 / ${tg?.new_exploratory ?? 0} 新) · ${Math.round(ms / 1000)}s`,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
