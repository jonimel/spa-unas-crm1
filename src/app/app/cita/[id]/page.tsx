import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, METHOD_LABEL, StatusPill, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { apptView } from '@/lib/booking'
import { rows } from '@/lib/db'
import { fmtPhone } from '@/lib/phone'
import { fmtDuration, fmtMoney, fmtTime, localParts } from '@/lib/time'
import { approveAction, cancelAction, noShowAction, rejectAction } from '../../actions'

const UUID = /^[0-9a-f-]{36}$/i

export default async function Cita({ params, searchParams }: PageProps<'/app/cita/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const a = await apptView(id)
  if (!a || a.tenant_id !== user.tenant_id) notFound()
  const mine = user.role === 'owner' || a.barber_id === user.id
  if (!mine) notFound()
  const msgs = await rows<{ body: string; to_kind: string; created_at: Date; status: string }>(
    `select body, to_kind, created_at, status from messages where appointment_id = $1 order by created_at`,
    [id],
  )
  const tz = a.timezone
  const backTo = `/app/cita/${id}`
  // eslint-disable-next-line react-hooks/purity -- componente de servidor, se calcula por petición
  const canCharge = ['confirmed', 'pending'].includes(a.status) && new Date(a.starts_at).getTime() - Date.now() < 3 * 3600_000
  const sourceLabel = { online: 'Reserva online', walkin: 'Cliente de paso', staff: 'Agendada en el spa' }[a.source]

  return (
    <main>
      <Top title="Cita" sub={`${a.day} · ${a.time}`} back={`/app/agenda?date=${localParts(new Date(a.starts_at), tz).ymd}`} />
      <Flash ok={sp.ok as string} err={sp.err as string} />

      <Link href={`/app/clientes/${a.client_id}`} className="card row" style={{ marginTop: 12 }}>
        <Avatar name={a.client_name} />
        <div className="grow">
          <b>{a.client_name}</b>
          <div className="small muted">{a.client_phone ? `+57 ${fmtPhone(a.client_phone)}` : 'Sin celular'}</div>
        </div>
        <span className="small" style={{ color: 'var(--brass)', fontWeight: 700 }}>
          Ver ficha →
        </span>
      </Link>

      {a.client_allergies && (
        <div className="alert-allergy" role="note" style={{ marginTop: 10 }}>
          <Icon name="alert" />
          <div>
            <b>Alergias y sensibilidades</b>
            {a.client_allergies}
          </div>
        </div>
      )}
      {a.client_colors && (
        <div className="note" style={{ marginTop: 10 }}>
          <b>Colores favoritos:</b> {a.client_colors}
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <div className="kv">
          <span>Estado</span>
          <span>
            <StatusPill status={a.status} />
          </span>
        </div>
        {a.lines.map((l, i) => (
          <div className="kv" key={i}>
            <span>{i === 0 ? (a.lines.length > 1 ? 'Servicios' : 'Servicio') : ''}</span>
            <span>
              {l.is_addon ? '+ ' : ''}
              {l.name} · {l.duration_min} min · {fmtMoney(l.price)}
            </span>
          </div>
        ))}
        {a.lines.length > 1 && (
          <div className="kv">
            <span>Duración</span>
            <span>{fmtDuration(a.duration_min)}</span>
          </div>
        )}
        <div className="kv">
          <span>Manicurista</span>
          <span>{a.barber_name}</span>
        </div>
        <div className="kv">
          <span>Sede</span>
          <span>{a.branch_name}</span>
        </div>
        <div className="kv">
          <span>Hora</span>
          <span>
            {a.time} – {fmtTime(new Date(a.ends_at), tz)}
          </span>
        </div>
        <div className="kv">
          <span>{a.lines.length > 1 ? 'Total' : 'Precio'}</span>
          <span>{fmtMoney(a.price)}</span>
        </div>
        <div className="kv">
          <span>Origen</span>
          <span>{sourceLabel}</span>
        </div>
        {a.status === 'pending' && a.deadline_time && (
          <div className="kv">
            <span>Aprobar antes de</span>
            <span style={{ color: 'var(--warn)' }}>{a.deadline_time}</span>
          </div>
        )}
        {a.paid_amount !== null && (
          <div className="kv">
            <span>Pagó</span>
            <span>
              {fmtMoney(a.paid_amount + (a.paid_tip ?? 0))} · {METHOD_LABEL[a.paid_method ?? ''] ?? a.paid_method}
              {a.paid_tip ? ` (propina ${fmtMoney(a.paid_tip)})` : ''}
            </span>
          </div>
        )}
      </div>
      {a.client_note && (
        <div className="note" style={{ marginTop: 10 }}>
          “{a.client_note}”
        </div>
      )}

      {a.status === 'pending' && (
        <div className="row" style={{ marginTop: 16 }}>
          <form action={rejectAction} style={{ flex: 1 }}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={backTo} />
            <button className="btn no">
              <Icon name="x" /> Rechazar
            </button>
          </form>
          <form action={approveAction} style={{ flex: 2 }}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={backTo} />
            <button className="btn ok">
              <Icon name="check" /> Confirmar
            </button>
          </form>
        </div>
      )}

      {canCharge && (
        <Link className="btn" href={`/app/cobrar/${id}`} style={{ marginTop: 12 }}>
          <Icon name="cash" /> Cobrar visita
        </Link>
      )}

      {a.status === 'confirmed' && (
        <div className="stack" style={{ marginTop: 12 }}>
          {new Date(a.starts_at) < new Date() && (
            <form action={noShowAction}>
              <input type="hidden" name="id" value={id} />
              <button className="btn ghost">No vino</button>
            </form>
          )}
        </div>
      )}

      {['pending', 'confirmed'].includes(a.status) && (
        <details className="more card" style={{ marginTop: 12 }}>
          <summary className="row">
            <Icon name="x" style={{ color: 'var(--bad)' }} />
            <b className="grow" style={{ color: 'var(--bad)' }}>
              Cancelar cita
            </b>
          </summary>
          <form action={cancelAction} className="stack" style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <div className="field">
              <label htmlFor="reason">Motivo (opcional, no se le envía al cliente)</label>
              <div className="in">
                <input id="reason" name="reason" placeholder="Ej.: el cliente pidió cambiar" />
              </div>
            </div>
            <button className="btn no">Sí, cancelar y avisar al cliente</button>
          </form>
        </details>
      )}

      {msgs.length > 0 && (
        <>
          <div className="eyebrow">WhatsApp de esta cita</div>
          <div className="stack">
            {msgs.map((m, i) => (
              <div key={i}>
                <div className="small muted" style={{ marginBottom: 4 }}>
                  Para {m.to_kind === 'client' ? 'el cliente' : m.to_kind === 'barber' ? 'la manicurista' : 'el dueño'} · {fmtTime(new Date(m.created_at), tz)}
                  {m.status === 'simulated' ? ' · simulado' : m.status === 'failed' ? ' · falló' : ''}
                </div>
                <div className="bubble">{m.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
