import type { Metadata, Viewport } from "next";
import { cookies } from 'next/headers'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import { Providers } from '@/lib/providers'
import { inter } from '@/lib/fonts'

export const metadata: Metadata = {
  title: 'Newshock',
  description: '主题投资情报. 信息展示, 非投资建议.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieMode = cookies().get('theme-mode')?.value
  const initialMode: 'light' | 'dark' = cookieMode === 'dark' ? 'dark' : 'light'

  return (
    <html
      lang="en"
      className={inter.variable}
      data-theme={initialMode}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('theme-mode');if(m==='dark'||m==='light'){document.documentElement.dataset.theme=m;document.cookie='theme-mode='+m+';path=/;max-age=31536000;samesite=lax'}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <AntdRegistry>
          <Providers initialMode={initialMode}>{children}</Providers>
        </AntdRegistry>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
