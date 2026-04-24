import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

const fontFamily =
  'var(--font-inter), "PingFang SC", "Source Han Sans CN", "Noto Sans SC", system-ui, -apple-system, sans-serif'

const sharedToken = {
  borderRadius: 8,
  fontFamily,
  fontFamilyCode: fontFamily,
  fontSize: 14,
  fontSizeHeading1: 26,
  fontSizeHeading2: 20,
  fontSizeHeading3: 16,
  fontSizeHeading4: 14,
  lineHeightHeading1: 1.1,
  fontWeightStrong: 600,
} as const

const sharedComponents = {
  Card: {
    borderRadiusLG: 8,
    paddingLG: 24,
  },
  Tag: {
    borderRadiusSM: 4,
  },
  Button: {
    borderRadius: 6,
    primaryShadow: 'none',
    defaultShadow: 'none',
  },
  Typography: {
    titleMarginTop: 0,
  },
  Statistic: {
    contentFontSize: 24,
    titleFontSize: 14,
  },
  Tabs: {
    titleFontSize: 14,
  },
}

export const newshockLightTheme: ThemeConfig = {
  token: {
    ...sharedToken,
    colorPrimary: '#1F1C19',
    colorLink: '#1F1C19',
    colorLinkHover: '#5C4A1E',
    colorLinkActive: '#3D2E12',

    colorBgLayout: '#F4F1EC',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    colorBorder: '#E8E2D5',
    colorBorderSecondary: '#EFEAE0',

    colorText: '#1F1C19',
    colorTextSecondary: '#5C4A1E',
    colorTextTertiary: '#6D6A63',
    colorTextQuaternary: '#767168',

    colorSuccess: '#5C6A1E',
    colorError: '#8B3A2E',
    colorWarning: '#A86C00',
    colorInfo: '#1F1C19',
  },
  components: {
    ...sharedComponents,
    Layout: {
      bodyBg: '#F4F1EC',
      headerBg: '#F4F1EC',
      siderBg: '#F4F1EC',
    },
    Card: {
      ...sharedComponents.Card,
      headerBg: '#FFFFFF',
    },
    Descriptions: {
      labelBg: '#F4F1EC',
      titleMarginBottom: 16,
    },
    Tabs: {
      ...sharedComponents.Tabs,
      itemSelectedColor: '#1F1C19',
      inkBarColor: '#1F1C19',
    },
    Progress: {
      defaultColor: '#1F1C19',
    },
  },
}

export const newshockDarkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorPrimary: '#EDE6D8',
    colorLink: '#D4C8B2',
    colorLinkHover: '#EDE6D8',
    colorLinkActive: '#C9BFA8',

    colorBgLayout: '#1A1815',
    colorBgContainer: '#242120',
    colorBgElevated: '#2C2926',

    colorBorder: '#3A3632',
    colorBorderSecondary: '#302D29',

    colorText: '#EDE6D8',
    colorTextSecondary: '#C9C2B4',
    colorTextTertiary: '#A8A196',
    colorTextQuaternary: '#8F8A7E',

    colorSuccess: '#8FA058',
    colorError: '#C87A6B',
    colorWarning: '#C89A52',
    colorInfo: '#EDE6D8',
  },
  components: {
    ...sharedComponents,
    Layout: {
      bodyBg: '#1A1815',
      headerBg: '#1A1815',
      siderBg: '#1A1815',
    },
    Card: {
      ...sharedComponents.Card,
      headerBg: '#242120',
    },
    Descriptions: {
      labelBg: '#1A1815',
      titleMarginBottom: 16,
    },
    Tabs: {
      ...sharedComponents.Tabs,
      itemSelectedColor: '#EDE6D8',
      inkBarColor: '#EDE6D8',
    },
    Progress: {
      defaultColor: '#EDE6D8',
    },
  },
}

// Kept for backwards compatibility with existing imports.
export const newshockTheme = newshockLightTheme

export const stageColors = {
  early: '#5C6A1E',
  mid: '#A86C00',
  late: '#8B3A2E',
  unknown: '#8C8A85',
} as const

export function stageColor(stage: string | null | undefined): string {
  if (stage === 'early') return stageColors.early
  if (stage === 'mid') return stageColors.mid
  if (stage === 'late' || stage === 'beyond' || stage === 'beyond_typical') return stageColors.late
  return stageColors.unknown
}
