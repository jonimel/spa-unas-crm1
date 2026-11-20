import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { ShopMark } from '@/components/ShopLogo'
import { rows } from '@/lib/db'

export const metadata = { title: 'Reservar una cita' }

// Pantalla solo para clientes: buscar el spa y pasar a su link de reservas (/r/<slug>).
// Aquí no hay nada del equipo (ni entrar, ni PIN), para que el cliente no se confunda.
// Solo salen spas que de verdad pueden recibir reservas: con un servicio activo y una manicurista con horario.
const LIMIT = 30

export default async function Reservar({ searchParams }: PageProps<'/reservar'>) {
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60)
  const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'
  const shops = await rows<{ slug: string; name: string; city: string | null }>(
    `select t.slug, t.name, t.city from tenants t
      where exists (select 1 from services s where s.tenant_id = t.id and s.active)
        and exists (select 1 from users u join working_hours w on w.barber_id = u.id
                     where u.tenant_id = t.id and u.active and (u.role = 'barber' or u.serves))
        and ($1 = '' or t.name ilike $2 or coalesce(t.city, '') ilike $2)
      order by t.name limit ${LIMIT + 1}`,
    [q, like],
  )
  const more = shops.length > LIMIT
  return (
    <main className="page">
      <div className="top">
        <Link className="back" href="/" aria-label="Volver">
          <Icon name="back" />
        </Link>
      </div>
      <h2 className="hero-title" style={{ fontSize: 38 }}>
        Reservar <em>una cita</em>
      </h2>
      <p className="muted" style={{ lineHeight: 1.5, marginTop: -4 }}>
        Busca tu spa y elige servicio, manicurista y hora. No necesitas cuenta.
      </p>

      <form className="field" role="search" style={{ marginTop: 14 }}>
        <label htmlFor="q">Tu spa</label>
        <div className="in">
          <Icon name="search" style={{ color: 'var(--muted)' }} />
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre o ciudad" autoComplete="off" enterKeyHint="search" />
        </div>
      </form>

      <div className="stack" style={{ marginTop: 16 }}>
        {shops.slice(0, LIMIT).map((t) => (
          <Link key={t.slug} className="role" href={`/r/${t.slug}`}>
            <ShopMark size={46} slug={t.slug} name={t.name} />
            <span className="grow">
              <b>{t.name}</b>
              <span>{t.city ? `${t.city} · Reservar` : 'Reservar'}</span>
            </span>
            <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
          </Link>
        ))}
        {shops.length === 0 && (
          <div className="card small muted" style={{ textAlign: 'center' }}>
            {q ? `No encontramos spas con «${q}». Revisa el nombre o pídele el link a tu spa.` : 'Todavía no hay spas recibiendo reservas.'}
          </div>
        )}
        {more && <p className="small muted">Hay más spas. Escribe el nombre para encontrar el tuyo.</p>}
      </div>

      <p className="small muted" style={{ marginTop: 22, lineHeight: 1.5 }}>
        ¿Tu spa te mandó un link? Ábrelo directo y reservas en segundos.
      </p>
    </main>
  )
}
