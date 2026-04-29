import type { Metadata, Viewport } from "next";
import { cookies } from 'next/headers'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import { Providers } from '@/lib/providers'
import { inter } from '@/lib/fonts'
import { getSiteUrl } from '@/lib/site-url'

const siteUrl = getSiteUrl()
const siteName = 'Newshock'
const siteTitle = 'Newshock — Thematic Investing Intelligence'
const siteDescription =
  'Track market themes, catalysts, and ticker exposure. Daily-updated thematic radar for self-directed investors. Information tool, not investment advice.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s · Newshock',
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    'thematic investing',
    'market themes',
    'event-driven investing',
    'ticker analysis',
    'catalyst tracking',
    'investment research',
    '主题投资',
    '事件驱动',
    '美股主题',
  ],
  authors: [{ name: siteName }],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName,
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    locale: 'en_US',
    alternateLocale: ['zh_CN'],
    images: [{ url: '/newshock-logo.png', width: 1200, height: 630, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/newshock-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
  const cookieLocale = cookies().get('locale')?.value
  const initialLocale: 'en' | 'zh' = cookieLocale === 'zh' ? 'zh' : 'en'
  const htmlLang = initialLocale === 'zh' ? 'zh-CN' : 'en'

  return (
    <html
      lang={htmlLang}
      className={inter.variable}
      data-theme={initialMode}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('theme-mode');if(m==='dark'||m==='light'){document.documentElement.dataset.theme=m;document.cookie='theme-mode='+m+';path=/;max-age=31536000;samesite=lax'}var l=localStorage.getItem('locale');if(l==='en'||l==='zh'){document.cookie='locale='+l+';path=/;max-age=31536000;samesite=lax'}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <AntdRegistry>
          <Providers initialMode={initialMode} initialLocale={initialLocale}>{children}</Providers>
        </AntdRegistry>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
