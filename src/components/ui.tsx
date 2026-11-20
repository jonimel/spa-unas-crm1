import Link from 'next/link'
import { Icon } from './Icon'
import { initials } from '@/lib/phone'
import { ShopMark } from './ShopLogo'

export function Top({ title, sub, back, act }: { title: string; sub?: React.ReactNode; back?: string; act?: React.ReactNode }) {
  return (
    <div className="top">
      {back && (
        <Link className="back" href={back} aria-label="Volver">
          <Icon name="back" />
        </Link>
      )}
      <div className="tt">
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {act && <div className="act">{act}</div>}
    </div>
  )
}

export function Brand({ name, sub, slug }: { name: string; sub?: string; slug?: string }) {
  return (
    <div className="brand">
      <ShopMark size={38} slug={slug} name={slug ? name : undefined} />
      <div>
        <b>{name}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

export function Avatar({ name, sm }: { name: string; sm?: boolean }) {
  return <span className={'av' + (sm ? ' sm' : '')}>{initials(name)}</span>
}

const STATUS: Record<string, [string, string]> = {
  pending: ['warn', 'Pendiente'],
  confirmed: ['ok', 'Confirmada'],
  completed: ['dim', 'Atendida'],
  rejected: ['bad', 'Rechazada'],
  cancelled: ['bad', 'Cancelada'],
  no_show: ['bad', 'No vino'],
}
export function StatusPill({ status }: { status: string }) {
  const [cls, label] = STATUS[status] ?? ['dim', status]
  return <span className={'pill ' + cls}>{label}</span>
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="flash err" role="alert">{err}</div>
  if (ok) return <div className="flash ok" role="status">{ok}</div>
  return null
}

export const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}
