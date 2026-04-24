type CategoryTone = {
  backgroundColor: string
  color: string
  border: 'none'
  fontWeight: 500
}

const DEFAULT_TONE: CategoryTone = {
  backgroundColor: '#FFF5E0',
  color: '#A86C00',
  border: 'none',
  fontWeight: 500,
}

const CATEGORY_TONES: Record<string, CategoryTone> = {
  geopolitical:       { backgroundColor: '#FFF5E0', color: '#A86C00', border: 'none', fontWeight: 500 },
  ai_semi:            { backgroundColor: '#F5EDD8', color: '#8B5A00', border: 'none', fontWeight: 500 },
  pharma:             { backgroundColor: '#F0F2D8', color: '#5C6A1E', border: 'none', fontWeight: 500 },
  energy:             { backgroundColor: '#F7E8D8', color: '#8B4513', border: 'none', fontWeight: 500 },
  macro_monetary:     { backgroundColor: '#EFE8D8', color: '#6B5A30', border: 'none', fontWeight: 500 },
  supply_chain:       { backgroundColor: '#F2E8D0', color: '#7A5E2E', border: 'none', fontWeight: 500 },
  defense:            { backgroundColor: '#E8E2D0', color: '#5C5040', border: 'none', fontWeight: 500 },
  crypto:             { backgroundColor: '#F5E8C8', color: '#8B6914', border: 'none', fontWeight: 500 },
  tech_breakthrough:  { backgroundColor: '#EDE8D5', color: '#5E5430', border: 'none', fontWeight: 500 },
  earnings:           { backgroundColor: '#E8DEC8', color: '#6B5520', border: 'none', fontWeight: 500 },
}

export const categoryTagStyle = DEFAULT_TONE

export function categoryTone(category: string | null | undefined): CategoryTone {
  if (!category) return DEFAULT_TONE
  return CATEGORY_TONES[category] ?? DEFAULT_TONE
}

export const arrowColor = {
  benefits: '#5C6A1E',
  headwind: '#8B3A2E',
  mixed: '#8C8A85',
  uncertain: '#8C8A85',
}
