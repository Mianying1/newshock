export function isSecFiling(event: { source_name: string | null }): boolean {
  return event.source_name === 'SEC EDGAR 8-K Filings'
}

export const SEC_DEFER_REASONING =
  'SEC 8-K filing - content requires deep-dive, classification deferred to user-time LLM'
