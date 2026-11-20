import { ShopMark } from '@/components/ShopLogo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { StatusPill } from '@/components/ui'
import { apptView } from '@/lib/booking'
import { rows } from '@/lib/db'
import { firstName } from '@/lib/phone'
import { fmtMoney } from '@/lib/time'

const UUID = /^[0-9a-f-]{36}$/i

export default async function CitaPublica({ params }: PageProps<'/r/[slug]/cita/[id]'>) {
  const { slug, id } = await params
  if (!UUID.test(id)) notFound()
  const a = await apptView(id)
  if (!a || a.tenant_slug !== slug) notFound()
  const msgs = await rows<{ body: string; created_at: Date }>(
    `select body, created_at from messages where appointment_id = $1 and to_kind = 'client' order by created_at`,
    [id],
  )
  const pending = a.status === 'pending'
  const ok = a.status === 'confirmed' || a.status === 'completed'
  const color = pending ? 'warn' : ok ? 'ok' : 'bad'
  return (
    <main className="page">
      <div className="top">
        <div className="tt brand">
          <ShopMark size={38} slug={a.tenant_slug} name={a.tenant_name} />
          <div>
            <b>{a.tenant_name}</b>
            <span>{a.branch_name}</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '22px 0 8px' }}>
        <div style={{ width: 74, height: 74, borderRadius: '50%', margin: '0 auto', display: 'grid', placeItems: 'center', background: `var(--${color}-soft)`, color: `var(--${color})` }}>
          <Icon name={pending ? 'clock' : ok ? 'check' : 'x'} size={36} />
        </div>
        <h2 className="hero-title" style={{ fontSize: 40, margin: '16px 0 6px' }}>
          {pending ? 'Solicitud enviada' : ok ? 'Cita confirmada' : 'Cita no confirmada'}
        </h2>
        <p className="muted" style={{ maxWidth: '32ch', margin: '0 auto', lineHeight: 1.5 }}>
          {pending
            ? `${firstName(a.barber_name)} confirma tu cita en máximo 2 horas. Te avisamos por WhatsApp.`
            : ok
              ? `Te esperamos en ${a.branch_name}${a.branch_address ? `, ${a.branch_address}` : ''}.`
              : 'Puedes elegir otra hora cuando quieras.'}
        </p>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="row">
          <StatusPill status={a.status} />
          <span className="grow" />
          <span className="small muted">{a.day}</span>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 34, marginTop: 10, textTransform: 'uppercase' }}>{a.time}</div>
        <div className="muted">
          {a.service_name} con {a.barber_name} · {fmtMoney(a.price)}
        </div>
      </div>
      {msgs.length > 0 && (
        <>
          <div className="eyebrow">Lo que te llega por WhatsApp</div>
          <div className="card stack">
            <div className="wa-head" style={{ margin: 0 }}>
              <span className="wa-dot">
                <Icon name="wa" />
              </span>
              <div>
                <b>{a.tenant_name}</b>
                <div className="small muted">WhatsApp</div>
              </div>
            </div>
            {msgs.map((m, i) => (
              <div key={i} className="bubble">
                {m.body}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="stack" style={{ marginTop: 18 }}>
        <Link className="btn ghost" href={`/r/${slug}`}>
          {ok || pending ? 'Reservar otra cita' : 'Elegir otra hora'}
        </Link>
        <p className="small muted" style={{ textAlign: 'center' }}>¿Necesitas cambiarla? Escríbenos por WhatsApp.</p>
      </div>
    </main>
  )
}
