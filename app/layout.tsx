import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry'
import "./globals.css";
import { Providers } from '@/lib/providers'
import { inter } from '@/lib/fonts'

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
      className={inter.variable}
    >
      <body className="antialiased">
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
