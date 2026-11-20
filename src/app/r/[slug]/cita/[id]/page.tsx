import { ShopMark } from '@/components/ShopLogo'
import { isUuid } from '@/lib/validate'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Flash, StatusPill } from '@/components/ui'
import { CLIENT_CANCEL_MIN_MS, clientCanCancel } from '@/lib/appointments'
import { apptView, spaWhatsApp } from '@/lib/booking'
import { rows } from '@/lib/db'
import { firstName, waLink } from '@/lib/phone'
import { fmtDuration, fmtMoney, fmtSpan } from '@/lib/time'
import { whatsappMode } from '@/lib/whatsapp'
import { cancelMyAppointment } from '../../actions'

const UUID = { test: isUuid }

export default async function CitaPublica({ params, searchParams }: PageProps<'/r/[slug]/cita/[id]'>) {
  const { slug, id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const a = await apptView(id)
  if (!a || a.tenant_slug !== slug) notFound()
  // en producción la clienta ya recibió estos mensajes en su WhatsApp: la tarjeta solo se muestra en modo simulado
  const msgs =
    whatsappMode() === 'simulated'
      ? await rows<{ body: string; created_at: Date }>(
          `select body, created_at from messages where appointment_id = $1 and to_kind = 'client' order by created_at`,
          [id],
        )
      : []
  const spaPhone = await spaWhatsApp(a.tenant_id, a.branch_id)
  const active = a.status === 'pending' || a.status === 'confirmed'
  const canCancel = clientCanCancel(a)
  const waText = `Hola, quiero cambiar mi cita del ${a.day} a las ${a.time} (${a.service_name}).`
  const pending = a.status === 'pending'
  const ok = a.status === 'confirmed' || a.status === 'completed'
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
      <Flash ok={sp.ok as string} err={sp.err as string} />
      <div className="confirm">
        <div className={'confirm-mark' + (ok ? ' ok' : pending ? '' : ' bad')}>
          <Icon name={pending ? 'sparkle' : ok ? 'check' : 'x'} />
        </div>
        <h2>{pending ? '¡Listo! Solicitud enviada' : ok ? 'Cita confirmada' : a.status === 'cancelled' ? 'Cita cancelada' : 'Cita no confirmada'}</h2>
        <p>
          {pending
            ? `${firstName(a.barber_name)} confirma tu cita ${a.deadline_time ? `antes de las ${a.deadline_time}` : 'muy pronto'}. Te avisamos por WhatsApp.`
            : ok
              ? `Te esperamos en ${a.branch_name}${a.branch_address ? `, ${a.branch_address}` : ''}.`
              : 'Puedes elegir otra hora cuando quieras.'}
        </p>
      </div>
      <div className="ticket">
        <div className="ticket-head">
          <StatusPill status={a.status} />
          <span className="grow" />
          <span className="small muted">{a.day}</span>
        </div>
        <div className="ticket-time">{a.time}</div>
        <div className="ticket-who">
          con {a.barber_name} · {a.branch_name}
        </div>
        <div className="ticket-cut" />
        {a.lines.map((l, i) => (
          <div className="kv" key={i}>
            <span>
              {l.is_addon ? '+ ' : ''}
              {l.name}
            </span>
            <span className="num">{fmtMoney(l.price)}</span>
          </div>
        ))}
        <div className="kv">
          <span>Total · {fmtDuration(a.duration_min)}</span>
          <span className="num">{fmtMoney(a.price)}</span>
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
      {active && (
        <div className="stack" style={{ marginTop: 18 }}>
          <a className="btn ghost" href={`/api/r/${slug}/cita/${id}/calendario`} download>
            <Icon name="cal" /> Agregar a mi calendario
          </a>
          {spaPhone && (
            <a className="btn wa" href={waLink(spaPhone, waText)} target="_blank" rel="noreferrer">
              <Icon name="wa" /> Escribir al spa por WhatsApp
            </a>
          )}
        </div>
      )}
      <div className="stack" style={{ marginTop: 12 }}>
        <Link className="btn ghost" href={`/r/${slug}`}>
          {ok || pending ? 'Reservar otra cita' : 'Elegir otra hora'}
        </Link>
      </div>
      {active &&
        (canCancel ? (
          <details className="more card" style={{ marginTop: 12 }}>
            <summary className="row">
              <Icon name="x" style={{ color: 'var(--bad)' }} />
              <b className="grow" style={{ color: 'var(--bad)' }}>
                Cancelar mi cita
              </b>
            </summary>
            <form action={cancelMyAppointment} className="stack" style={{ marginTop: 12 }}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={id} />
              <p className="small muted" style={{ margin: 0 }}>
                Le avisamos a {firstName(a.barber_name)} y el espacio queda libre para otra clienta. Si solo quieres cambiar la hora, escríbenos por WhatsApp.
              </p>
              <button className="btn no">Sí, cancelar mi cita</button>
            </form>
          </details>
        ) : (
          <p className="small muted" style={{ textAlign: 'center', marginTop: 12 }}>
            Faltan menos de {fmtSpan(CLIENT_CANCEL_MIN_MS / 60_000)}: para cancelar o cambiar, escríbenos por WhatsApp.
          </p>
        ))}
    </main>
  )
}
