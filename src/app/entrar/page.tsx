import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { ShopMark } from '@/components/ShopLogo'
import { currentUser } from '@/lib/auth'
import { STAFF_ROLES } from './roles'

export const metadata = { title: 'Entrar · Equipo' }

// Entrada del equipo: primero se elige quién eres (dueño o manicurista) y después celular + PIN.
// Las clientas no entran aquí: reservan desde el link de su spa (/r/...) o desde /reservar.
export default async function Entrar() {
  if (await currentUser()) redirect('/app')
  return (
    <main className="page">
      <div style={{ display: 'grid', placeItems: 'center', margin: '28px 0 6px' }}>
        <ShopMark size={96} />
      </div>
      <h2 className="hero-title" style={{ fontSize: 40, textAlign: 'center' }}>
        Entrar
      </h2>
      <p className="muted small" style={{ textAlign: 'center', margin: '-4px 0 6px' }}>
        Solo para el equipo del spa. ¿Quién eres?
      </p>

      <div className="stack" style={{ marginTop: 14 }}>
        {Object.entries(STAFF_ROLES).map(([key, r]) => (
          <Link key={key} className="role" href={`/entrar/${key}`}>
            <span className="ri">
              <Icon name={r.icon} />
            </span>
            <span className="grow">
              <b>{r.title}</b>
              <span>{r.desc}</span>
            </span>
            <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 22 }}>
        <div className="row">
          <Icon name="cal" style={{ color: 'var(--brass)' }} />
          <div className="grow small">
            <b>¿Quieres reservar una cita?</b>
            <div className="muted">Las clientas no necesitan cuenta.</div>
          </div>
          <Link className="link small" href="/reservar" style={{ display: 'grid', placeItems: 'center' }}>
            Reservar
          </Link>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 18 }}>
        ¿Tienes un spa y todavía no usas Spa Uñas CRM? <Link className="link" href="/registro">Regístralo aquí</Link>
      </p>
    </main>
  )
}
