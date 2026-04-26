import vercelConfig from '@/vercel.json'
import { runAllHealthChecks, type CronEntry } from '@/lib/health-checks'
import HealthDashboard from './HealthDashboard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminHealthPage() {
  const crons = (vercelConfig as { crons: CronEntry[] }).crons
  const health = await runAllHealthChecks(crons)
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  return (
    <HealthDashboard
      generatedAt={generatedAt}
      crons={crons.map((c) => ({ path: c.path, schedule: c.schedule }))}
      manualTriggersEnabled={process.env.NODE_ENV === 'development'}
      data={{
        errors: health.classifierErrors.data,
        coverage: {
          level_of_impact: health.levelOfImpact.data,
          supports_or_contradicts: {
            filled: health.counterEvidence.data.filled,
            total: health.counterEvidence.data.total,
          },
          exposure_type: health.exposureType.data,
        },
        volume: health.pipelineVolume.data,
        cronStatus: health.cronStatus.data,
        conviction: health.convictionCoverage.data,
        counter: health.counterEvidence.data,
        alerts: health.alerts,
        themeAlerts24h: health.themeAlerts24h.data,
        sentimentShifts: health.sentimentShifts7d.data,
      }}
    />
  )
}
