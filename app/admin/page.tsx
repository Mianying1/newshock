import Link from 'next/link'

const LINKS: Array<{ href: string; label: string; desc: string }> = [
  { href: '/admin/health', label: 'Health Dashboard', desc: 'Pipeline, crons, coverage, alerts' },
  { href: '/admin/candidates', label: 'Archetype Candidates', desc: 'Weekly scan review queue' },
  { href: '/admin/angles', label: 'New Angle Candidates', desc: 'Long-horizon angle proposals from events' },
  { href: '/admin/coverage-audit', label: 'Coverage Audit', desc: 'Archetype coverage + suggestions' },
  { href: '/admin/cases', label: 'Historical Cases', desc: 'Case library' },
  { href: '/admin/ticker-graph', label: 'Ticker Graph', desc: 'Ticker ↔ archetype relationships' },
]

export default function AdminHubPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-zinc-900">Admin</h1>
          <p className="text-sm text-zinc-500">Internal tools · no end-user UI</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block border border-zinc-200 bg-white rounded-lg px-4 py-3 hover:border-zinc-400 transition-colors"
            >
              <div className="font-medium text-zinc-900">{l.label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{l.desc}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">{l.href}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
