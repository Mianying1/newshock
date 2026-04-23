'use client'
import { useI18n } from '@/lib/i18n-context'
import type { NewAngleCandidateRow } from '@/lib/ticker-scoring'

interface Props {
  row: NewAngleCandidateRow
}

export default function NewAngleCard({ row }: Props) {
  const { t } = useI18n()

  const isUnreviewed = row.reviewed_at === null
  const tickers = row.proposed_tickers.slice(0, 3)
  const confidence = row.confidence ?? 0
  const confidencePct = Math.round(confidence * 100)

  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-zinc-900">{row.angle_label}</h4>
            {isUnreviewed && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">
                🤖 {t('new_angle.ai_flag')}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1 truncate">
            {row.umbrella_theme_name}
          </p>
        </div>
        <span className="text-xs font-mono text-zinc-600 shrink-0 px-2 py-0.5 bg-zinc-50 rounded border border-zinc-200">
          {confidencePct}%
        </span>
      </div>

      {row.angle_description && (
        <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{row.angle_description}</p>
      )}

      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tickers.map((t) => (
            <span key={t} className="px-1.5 py-0.5 text-xs font-mono bg-zinc-100 text-zinc-700 rounded">
              {t}
            </span>
          ))}
          {row.proposed_tickers.length > 3 && (
            <span className="px-1.5 py-0.5 text-xs text-zinc-400">
              +{row.proposed_tickers.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
