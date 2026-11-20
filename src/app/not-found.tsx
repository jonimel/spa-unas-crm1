import Link from 'next/link'
import { Icon } from '@/components/Icon'

export const metadata = { title: 'Página no encontrada · Spa Uñas CRM' }

export default function NotFound() {
  return (
    <main className="page">
      <div className="confirm">
        <div className="confirm-mark">
          <Icon name="search" />
        </div>
        <h2>No encontramos esta página</h2>
        <p>Puede que el link esté incompleto o que la cita ya no exista. Revisa el link o vuelve al inicio.</p>
      </div>
      <div className="stack" style={{ marginTop: 18 }}>
        <Link className="btn" href="/">
          Ir al inicio
        </Link>
        <Link className="btn ghost" href="/reservar">
          Reservar una cita
        </Link>
      </div>
    </main>
  )
}
