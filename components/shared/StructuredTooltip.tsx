import type { ReactNode } from 'react'

export function structureDescription(text: string): {
  lead: string
  rubric: string
  rationale: string
} {
  const sentences = text.trim().split(/(?<=[.?!。？！])\s+/).filter(Boolean)
  if (sentences.length <= 1) return { lead: text.trim(), rubric: '', rationale: '' }
  if (sentences.length === 2) return { lead: sentences[0], rubric: '', rationale: sentences[1] }
  return {
    lead: sentences[0],
    rubric: sentences.slice(1, -1).join(' '),
    rationale: sentences[sentences.length - 1],
  }
}

export function StructuredTooltipContent({ description }: { description: string }): ReactNode {
  const { lead, rubric, rationale } = structureDescription(description)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.5 }}>
      <div>{lead}</div>
      {rubric && (
        <div
          style={{
            fontSize: 11,
            opacity: 0.82,
            paddingLeft: 8,
            borderLeft: '2px solid rgba(255,255,255,0.25)',
          }}
        >
          {rubric}
        </div>
      )}
      {rationale && <div style={{ opacity: 0.72 }}>{rationale}</div>}
    </div>
  )
}
