'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/Icon'

const TABS = {
  owner: [
    { href: '/app/agenda', label: 'Agenda', icon: 'cal' },
    { href: '/app/analisis', label: 'Análisis', icon: 'chart' },
    { href: '/app/comisiones', label: 'Pagos', icon: 'cash' },
    { href: '/app/clientes', label: 'Clientes', icon: 'users' },
    { href: '/app/ajustes', label: 'Ajustes', icon: 'gear' },
  ],
  barber: [
    { href: '/app/agenda', label: 'Mi agenda', icon: 'cal' },
    { href: '/app/comisiones', label: 'Pagos', icon: 'cash' },
    { href: '/app/clientes', label: 'Clientes', icon: 'users' },
    { href: '/app/cuenta', label: 'Cuenta', icon: 'polish' },
  ],
}

export function TabBar({ role, alerts }: { role: 'owner' | 'barber'; alerts: number }) {
  const path = usePathname()
  return (
    <nav className="tabs" aria-label="Menú">
      {TABS[role].map((t) => {
        const on = path.startsWith(t.href) || (t.href === '/app/ajustes' && path.startsWith('/app/mensajes')) || (t.href === '/app/agenda' && (path.startsWith('/app/cita') || path.startsWith('/app/cobrar') || path.startsWith('/app/nueva')))
        return (
          <Link key={t.href} href={t.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} />
            {t.label}
            {t.href === '/app/agenda' && alerts > 0 && <i className="dot" aria-label={`${alerts} pendientes`} />}
          </Link>
        )
      })}
    </nav>
  )
}
