import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'
import { BrowserNoise } from '@/components/BrowserNoise'
import { MoneyInputs } from '@/components/MoneyInputs'
import { NoDoubleSubmit } from '@/components/NoDoubleSubmit'
import './globals.css'

export const dynamic = 'force-dynamic'

// Títulos: Cormorant Garamond (serif elegante). Texto: DM Sans (muy legible en el celular).
// next/font las sirve desde la propia app: sin parpadeo y sin pedirle nada a Google en cada visita.
const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})
const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Spa Uñas CRM',
  description: 'Reservas, agenda, cobros y clientas para tu spa de uñas.',
  applicationName: 'Spa Uñas CRM',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf6f1' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1117' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <body>
        <BrowserNoise />
        <MoneyInputs />
        <NoDoubleSubmit />
        <div className="shell">{children}</div>
      </body>
    </html>
  )
}
