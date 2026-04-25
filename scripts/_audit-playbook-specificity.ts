import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'node:fs'
import * as path from 'node:path'

interface Case {
  name: string
  approximate_duration?: string
  confidence?: string
}

interface Playbook {
  historical_cases?: Case[]
  this_time_different?: { observation?: string }
  specific_to_this_theme?: string
  typical_duration_label?: string
}

interface Row {
  id: string
  name: string
  archetype_id: string
  specific_playbook: Playbook | null
  specific_playbook_generated_at: string | null
  theme_archetypes: { name: string; playbook: Playbook | null } | null
}

function caseNames(pb: Playbook | null): string[] {
  return (pb?.historical_cases ?? []).map(c => c.name)
}

async function main() {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  const { data, error } = await supabaseAdmin
    .from('themes')
    .select(
      'id, name, archetype_id, specific_playbook, specific_playbook_generated_at, ' +
      'theme_archetypes!inner(name, playbook)'
    )
    .eq('status', 'active')
    .order('theme_strength_score', { ascending: false })

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const themes = (data ?? []) as unknown as Row[]
  const withSpecific = themes.filter(t => t.specific_playbook)
  const withoutSpecific = themes.filter(t => !t.specific_playbook)

  // Sibling clustering by archetype_id
  const byArchetype = new Map<string, Row[]>()
  for (const t of themes) {
    if (!byArchetype.has(t.archetype_id)) byArchetype.set(t.archetype_id, [])
    byArchetype.get(t.archetype_id)!.push(t)
  }

  const lines: string[] = []
  lines.push('# Theme-Specific Playbook · Specificity Audit')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Active themes: **${themes.length}**`)
  lines.push(`- With theme-specific playbook: **${withSpecific.length}**`)
  lines.push(`- Falling back to archetype baseline: **${withoutSpecific.length}**`)
  lines.push('')

  // Sibling clusters where multiple themes share an archetype — these are the
  // cases where the old shared-playbook problem was most acute.
  const siblingGroups = [...byArchetype.entries()]
    .filter(([, members]) => members.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)

  lines.push('## Sibling Theme Clusters (where the old shared playbook hurt the most)')
  lines.push('')
  for (const [archetypeId, members] of siblingGroups.slice(0, 6)) {
    const archName = members[0].theme_archetypes?.name ?? archetypeId
    const archCases = caseNames(members[0].theme_archetypes?.playbook ?? null)
    lines.push(`### ${archName}  (${members.length} themes)`)
    lines.push('')
    lines.push(`**Archetype baseline cases** (previously shared by all members):`)
    archCases.forEach(c => lines.push(`  - ${c}`))
    lines.push('')
    for (const m of members) {
      const cases = caseNames(m.specific_playbook)
      lines.push(`#### ${m.name}`)
      if (cases.length > 0) {
        lines.push(`Theme-specific cases:`)
        cases.forEach(c => lines.push(`  - ${c}`))
        const obs = m.specific_playbook?.this_time_different?.observation
        if (obs) lines.push(`  > ${obs}`)
        const note = m.specific_playbook?.specific_to_this_theme
        if (note) lines.push(`  > **Why different:** ${note}`)
      } else {
        lines.push(`(no specific playbook · falling back to archetype)`)
      }
      lines.push('')
    }
  }

  // Sample 8 themes for detailed before/after diff
  lines.push('## Detailed Before/After Sample (8 themes)')
  lines.push('')
  const sample = withSpecific.slice(0, 8)
  for (const t of sample) {
    const archCases = caseNames(t.theme_archetypes?.playbook ?? null)
    const themeCases = caseNames(t.specific_playbook)
    lines.push(`### ${t.name}`)
    lines.push(`Archetype: \`${t.theme_archetypes?.name}\``)
    lines.push('')
    lines.push('**Before (archetype baseline):**')
    archCases.forEach(c => lines.push(`  - ${c}`))
    lines.push('')
    lines.push('**After (theme-specific):**')
    themeCases.forEach(c => lines.push(`  - ${c}`))
    const note = t.specific_playbook?.specific_to_this_theme
    if (note) {
      lines.push('')
      lines.push(`**Specificity note:** ${note}`)
    }
    lines.push('')
  }

  if (withoutSpecific.length > 0) {
    lines.push('## Themes still using archetype fallback')
    lines.push('')
    withoutSpecific.forEach(t => lines.push(`- ${t.name}  \`${t.id}\``))
    lines.push('')
  }

  const outPath = path.join('/tmp', 'playbook-specificity-audit.md')
  fs.writeFileSync(outPath, lines.join('\n'))
  console.log(`✅ Audit written: ${outPath}`)
  console.log(`   ${themes.length} themes · ${withSpecific.length} specific · ${withoutSpecific.length} fallback`)
  console.log(`   ${siblingGroups.length} sibling clusters analyzed`)
}

main().catch(e => { console.error(e); process.exit(1) })
