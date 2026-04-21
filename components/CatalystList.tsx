import type { CatalystEvent } from '@/types/recommendations'

export default function CatalystList({ catalysts }: { catalysts: CatalystEvent[] }) {
  if (catalysts.length === 0) {
    return <p className="text-sm text-zinc-400">暂无触发事件记录</p>
  }

  return (
    <div className="space-y-3">
      {catalysts.map((c) => (
        <div key={c.id}>
          {c.source_url ? (
            <a
              href={c.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              {c.headline}
            </a>
          ) : (
            <p className="text-sm text-zinc-900">{c.headline}</p>
          )}
          <p className="text-xs text-zinc-400 mt-0.5">
            {c.source_name && <span>{c.source_name} · </span>}
            {c.days_ago === 0 ? '今天' : `${c.days_ago} 天前`}
          </p>
        </div>
      ))}
    </div>
  )
}
