import type { ThemeConfig } from 'antd'

export const newshockTheme: ThemeConfig = {
  token: {
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
    colorTextTertiary: '#8C8A85',
    colorTextQuaternary: '#A8A196',

    colorSuccess: '#5C6A1E',
    colorError: '#8B3A2E',
    colorWarning: '#A86C00',
    colorInfo: '#1F1C19',

    borderRadius: 8,

    fontSizeHeading1: 26,
    lineHeightHeading1: 1.1,

    fontFamily:
      'var(--font-inter), "PingFang SC", "Source Han Sans CN", "Noto Sans SC", system-ui, -apple-system, sans-serif',
    fontFamilyCode:
      'var(--font-inter), "PingFang SC", "Source Han Sans CN", "Noto Sans SC", system-ui, -apple-system, sans-serif',
    fontSize: 14,
    fontSizeHeading2: 20,
    fontSizeHeading3: 16,
    fontSizeHeading4: 14,
    fontWeightStrong: 600,
  },
  components: {
    Layout: {
      bodyBg: '#F4F1EC',
      headerBg: '#F4F1EC',
      siderBg: '#F4F1EC',
    },
    Card: {
      headerBg: '#FFFFFF',
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
    Descriptions: {
      labelBg: '#F4F1EC',
      titleMarginBottom: 16,
    },
    Tabs: {
      itemSelectedColor: '#1F1C19',
      inkBarColor: '#1F1C19',
      titleFontSize: 14,
    },
    Progress: {
      defaultColor: '#1F1C19',
    },
  },
}

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
