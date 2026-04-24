import type { ThemeConfig } from 'antd'

export const newshockTheme: ThemeConfig = {
  token: {
    colorPrimary: '#0B5FFF',

    colorBgLayout: '#F4F1EC',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    colorBorder: '#E8E2D5',
    colorBorderSecondary: '#EFEAE0',

    colorText: '#1F1C19',
    colorTextSecondary: '#3A3530',
    colorTextTertiary: '#6B655E',
    colorTextQuaternary: '#9A9389',

    colorSuccess: '#2E7D4F',
    colorError: '#B8453A',
    colorWarning: '#B77818',
    colorInfo: '#0B5FFF',

    borderRadius: 8,

    fontSizeHeading1: 26,
    lineHeightHeading1: 1.1,

    fontFamily:
      'var(--font-inter), "PingFang SC", "Source Han Sans CN", "Noto Sans SC", system-ui, -apple-system, sans-serif',
    fontFamilyCode:
      'var(--font-jbm), ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 14,
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
      itemSelectedColor: '#0B5FFF',
      inkBarColor: '#0B5FFF',
      titleFontSize: 14,
    },
    Progress: {
      defaultColor: '#0B5FFF',
    },
  },
}
