import type { Metadata, Viewport } from 'next'
import { BrowserNoise } from '@/components/BrowserNoise'
import { MoneyInputs } from '@/components/MoneyInputs'
import { NoDoubleSubmit } from '@/components/NoDoubleSubmit'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Barbar · Agenda para barberías',
  description: 'Reservas, agenda, cobros y clientes para tu barbería.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f0e0d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <BrowserNoise />
        <MoneyInputs />
        <NoDoubleSubmit />
        <div className="shell">{children}</div>
      </body>
    </html>
  )
}
