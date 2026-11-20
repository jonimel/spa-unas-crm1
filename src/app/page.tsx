import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Brand } from '@/components/ui'
import { STAFF_ROLES } from './entrar/roles'

// Inicio: dos caminos separados para que nadie se confunda.
// Clientes → /reservar (o directo al link de su spa). Equipo → /entrar/dueno o /entrar/manicurista.
export default function Home() {
  return (
    <main className="page">
      <div className="top">
        <Brand name="Spa Uñas" sub="Agenda para spas de uñas" />
      </div>
      <h2 className="hero-title">
        Tu spa, <em>en orden</em>
      </h2>
      <p className="muted" style={{ lineHeight: 1.5 }}>
        Reservas por link, agenda de cada manicurista, cobros, pagos al equipo y clientas. Desde el celular, sin descargar nada.
      </p>

      <div className="eyebrow">Clientas</div>
      <Link className="role role-client" href="/reservar">
        <span className="ri">
          <Icon name="cal" />
        </span>
        <span className="grow">
          <b>Reservar una cita</b>
          <span>Elige tu spa, el servicio y la hora. Sin cuenta ni app.</span>
        </span>
        <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
      </Link>

      <div className="eyebrow">Equipo del spa</div>
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
          Registrar mi spa
        </Link>
      </div>
    </main>
  )
}
