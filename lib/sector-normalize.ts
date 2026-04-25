// Sector taxonomy normalization.
// The tickers table holds free-form sector strings ("pharma", "Pharma",
// "AI/Semi", "ai_semi"). For sector-baseline checks we collapse these to
// a single canonical form so the archetype's expected_sectors[] can match.

export function normalizeSector(s: string | null | undefined): string | null {
  if (!s) return null
  const lower = s.trim().toLowerCase().replace(/[\s/-]+/g, '_')
  if (!lower) return null
  // Aliases: collapse synonymous values that snuck into the table.
  const aliases: Record<string, string> = {
    automotive: 'auto',
    'ai/semi': 'ai_semi',
  }
  return aliases[lower] ?? lower
}

// Vocabulary that Haiku is allowed to pick from when populating
// theme_archetypes.expected_sectors. Keep in sync with normalizeSector output.
export const SECTOR_VOCAB: readonly string[] = [
  'pharma', 'biotech', 'semiconductors', 'ai_semi', 'ai_infrastructure',
  'technology', 'software', 'networking', 'data_center_reit',
  'energy', 'clean_energy', 'nuclear_smr', 'fuel_cell',
  'utilities', 'power_data_center',
  'defense', 'aerospace',
  'reit',
  'agriculture',
  'materials',
  'consumer', 'consumer_discretionary',
  'fintech',
  'logistics', 'industrials', 'supply_chain', 'shipping', 'transportation',
  'cannabis',
  'ev', 'auto',
  'etf', 'commodity_etf',
  'geopolitics',
] as const
