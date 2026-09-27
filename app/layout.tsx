import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Heebo, Rubik } from 'next/font/google'
import './globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo' })
const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-rubik',
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'דוח בדיקת מערכת דלוחים בדירה',
  description: 'אפליקציה לעובדי שטח לתיעוד בדיקות מערכת דלוחים בדירות: שטיפה, הצפה וצילום צנרת.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f3f6f9',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`bg-background ${heebo.variable} ${rubik.variable}`}>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
