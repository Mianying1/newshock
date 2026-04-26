// Maps the DB's 5-level institutional_awareness onto the 4-level Theme Map design.
// status='cooling' overrides awareness regardless of its value (the theme is winding down).
//
// DB awareness     →  Map level
//   hidden         →  HIDDEN
//   early          →  EMERGING
//   rising         →  EMERGING
//   mainstream     →  VISIBLE
//   overheated     →  CROWDED
//   (status=cooling overrides → COOLING)

export type ThemeMapLevel = 'HIDDEN' | 'EMERGING' | 'VISIBLE' | 'CROWDED' | 'COOLING'

export function mapVisibility(
  awareness: string | null | undefined,
  status: string | null | undefined,
): ThemeMapLevel {
  if (status === 'cooling') return 'COOLING'
  switch (awareness) {
    case 'hidden':     return 'HIDDEN'
    case 'early':      return 'EMERGING'
    case 'rising':     return 'EMERGING'
    case 'mainstream': return 'VISIBLE'
    case 'overheated': return 'CROWDED'
    default:           return 'EMERGING'
  }
}

export const VIS_LABEL_ZH: Record<ThemeMapLevel, string> = {
  HIDDEN:   '隐形',
  EMERGING: '浮现',
  VISIBLE:  '可见',
  CROWDED:  '过热',
  COOLING:  '降温',
}

export const VIS_LABEL_EN: Record<ThemeMapLevel, string> = {
  HIDDEN:   'Hidden',
  EMERGING: 'Emerging',
  VISIBLE:  'Visible',
  CROWDED:  'Crowded',
  COOLING:  'Cooling',
}
