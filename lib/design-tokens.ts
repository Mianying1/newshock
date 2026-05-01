import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

const fontFamily =
  'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Source Han Sans CN", "Noto Sans SC", system-ui, sans-serif'

// System-font cascade for tiny UI labels (fontSize ≤ 11 + wide letter-spacing).
// Inter is optimized for ≥14px; at small sizes its hinting on macOS is uneven.
// SF Pro / Segoe UI are hand-tuned for tiny UI by the OS vendor — much crisper.
export const fontFamilySystem =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Source Han Sans CN", system-ui, sans-serif'

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
    colorPrimary: '#15181C',
    colorLink: '#0F6F66',
    colorLinkHover: '#0B574F',
    colorLinkActive: '#084740',

    colorBgLayout: '#F2F4F7',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    colorBorder: '#E1E5EA',
    colorBorderSecondary: '#EBEEF2',

    colorText: '#15181C',
    colorTextSecondary: '#454B53',
    colorTextTertiary: '#6B727B',
    colorTextQuaternary: '#8C939C',

    colorSuccess: '#1B7A4F',
    colorError: '#9C463B',
    colorWarning: '#A8590F',
    colorInfo: '#0F6F66',
  },
  components: {
    ...sharedComponents,
    Layout: {
      bodyBg: '#F2F4F7',
      headerBg: '#F2F4F7',
      siderBg: '#F2F4F7',
    },
    Card: {
      ...sharedComponents.Card,
      headerBg: '#FFFFFF',
    },
    Descriptions: {
      labelBg: '#F2F4F7',
      titleMarginBottom: 16,
    },
    Tabs: {
      ...sharedComponents.Tabs,
      itemSelectedColor: '#15181C',
      inkBarColor: '#15181C',
    },
    Progress: {
      defaultColor: '#15181C',
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
  early: '#1B7A4F',
  mid: '#3D5BA9',
  late: '#9C463B',
  unknown: '#8C939C',
} as const

export function stageColor(stage: string | null | undefined): string {
  if (stage === 'early') return stageColors.early
  if (stage === 'mid') return stageColors.mid
  if (stage === 'late' || stage === 'beyond' || stage === 'beyond_typical') return stageColors.late
  return stageColors.unknown
}
