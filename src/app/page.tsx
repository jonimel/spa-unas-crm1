import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Brand } from '@/components/ui'
import { STAFF_ROLES } from './entrar/roles'

// Inicio: dos caminos separados para que nadie se confunda.
// Clientes → /reservar (o directo al link de su barbería). Equipo → /entrar/dueno o /entrar/barbero.
export default function Home() {
  return (
    <main className="page">
      <div className="top">
        <Brand name="Barbar" sub="Agenda para barberías" />
      </div>
      <h2 className="hero-title">
        Tu barbería, <em>en orden</em>
      </h2>
      <p className="muted" style={{ lineHeight: 1.5 }}>
        Reservas por link, agenda de cada barbero, cobros, pagos al equipo y clientes. Desde el celular, sin descargar nada.
      </p>

      <div className="eyebrow">Clientes</div>
      <Link className="role role-client" href="/reservar">
        <span className="ri">
          <Icon name="cal" />
        </span>
        <span className="grow">
          <b>Reservar una cita</b>
          <span>Elige tu barbería, el servicio y la hora. Sin cuenta ni app.</span>
        </span>
        <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
      </Link>

      <div className="eyebrow">Equipo de la barbería</div>
      <div className="stack">
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

      <div className="stack" style={{ marginTop: 26 }}>
        <Link className="btn ghost" href="/registro">
          Registrar mi barbería
        </Link>
      </div>
    </main>
  )
}
