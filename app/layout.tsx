import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import "./globals.css";
import { I18nProvider } from '@/lib/i18n-context'
import { instrumentSerif, inter, jetbrainsMono } from '@/lib/fonts'
import { newshockTheme } from '@/lib/design-tokens'

export const metadata: Metadata = {
  title: 'Newshock',
  description: '主题投资情报. 信息展示, 非投资建议.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <AntdRegistry>
          <ConfigProvider theme={newshockTheme}>
            <I18nProvider>{children}</I18nProvider>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
