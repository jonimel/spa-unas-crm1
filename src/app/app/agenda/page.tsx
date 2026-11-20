import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, StatusPill } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { apptList, type ApptView } from '@/lib/booking'
import { one, rows } from '@/lib/db'
import { firstName } from '@/lib/phone'
import { addDaysYmd, atLocal, fmtDayLong, fmtMoney, fmtTime, fmtYmdShort, isYmd, todayYmd } from '@/lib/time'
import { approveAction, readAlert, rejectAction } from '../actions'

export default async function Agenda({ searchParams }: PageProps<'/app/agenda'>) {
  const user = await requireUser()
  const sp = await searchParams
  const tz = user.timezone
  const today = todayYmd(tz)
  const date = isYmd(sp.date) ? sp.date : today
  const owner = user.role === 'owner'
  const branchF = owner && typeof sp.sede === 'string' ? sp.sede : ''
  const barberF = owner && typeof sp.barbero === 'string' ? sp.barbero : ''

  const branches = owner ? await rows<{ id: string; name: string }>('select id, name from branches where tenant_id = $1 and active order by sort', [user.tenant_id]) : []
  const barbers = owner
    ? await rows<{ id: string; name: string }>(
        `select distinct u.id, u.name from users u left join working_hours w on w.barber_id = u.id
          where u.tenant_id = $1 and u.role = 'barber' and u.active ${branchF ? 'and w.branch_id = $2' : ''} order by u.name`,
        branchF ? [user.tenant_id, branchF] : [user.tenant_id],
      )
    : []

  // filtros de alcance
  const scope: string[] = ['a.tenant_id = $1']
  const params: unknown[] = [user.tenant_id]
  if (!owner) {
    params.push(user.id)
    scope.push(`a.barber_id = $${params.length}`)
  } else {
    if (branchF) {
      params.push(branchF)
      scope.push(`a.branch_id = $${params.length}`)
    }
    if (barberF) {
      params.push(barberF)
      scope.push(`a.barber_id = $${params.length}`)
    }
  }
  const where = scope.join(' and ')

  const pending = await apptList(`${where} and a.status = 'pending' and a.starts_at > now()`, params, 'a.approval_deadline nulls last, a.starts_at')
  const dayStart = atLocal(date, 0, tz)
  const dayEnd = atLocal(addDaysYmd(date, 1), 0, tz)
  const p2 = [...params, dayStart, dayEnd]
  const day = await apptList(`${where} and a.starts_at >= $${p2.length - 1} and a.starts_at < $${p2.length} and a.status not in ('rejected')`, p2)
  const alerts = owner
    ? await rows<{ id: string; title: string; appointment_id: string }>(
        `select al.id, al.title, al.appointment_id from alerts al join appointments a on a.id = al.appointment_id
          where al.user_id = $1 and al.read_at is null order by al.created_at desc limit 5`,
        [user.id],
      )
    : []
  const cash = await one<{ total: number; n: number }>(
    `select coalesce(sum(p.amount + p.tip), 0)::int total, count(*)::int n from payments p join appointments a on a.id = p.appointment_id
      where ${where} and p.paid_at >= $${p2.length - 1} and p.paid_at < $${p2.length}`,
    p2,
  )

  const now = new Date()
  const isToday = date === today
  const active = day.filter((a) => a.status !== 'cancelled')
  const qs = (o: Record<string, string>) => {
    const q = new URLSearchParams({ ...(branchF ? { sede: branchF } : {}), ...(barberF ? { barbero: barberF } : {}), date, ...o })
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k)
    return `/app/agenda?${q}`
  }
  const backTo = qs({})

  return (
    <main>
      <div className="top">
        <div className="tt">
          <h1>{owner ? 'Agenda' : 'Mi agenda'}</h1>
          <div className="sub">
            {owner ? user.tenant_name : firstName(user.name)} · {fmtDayLong(dayStart, tz)}
          </div>
        </div>
        <div className="act">
          <Link className="btn sm" href="/app/nueva">
            <Icon name="plus" /> Nueva
          </Link>
        </div>
      </div>
      <Flash ok={sp.ok as string} err={sp.err as string} />

      {alerts.map((al) => (
        <div key={al.id} className="alert" style={{ marginTop: 12 }}>
          <div className="t">
            <Icon name="clock" /> Sin respuesta del barbero
          </div>
          <div style={{ margin: '6px 0 10px', lineHeight: 1.45 }}>{al.title}</div>
          <div className="row">
            <Link className="btn sm" style={{ flex: 1 }} href={`/app/cita/${al.appointment_id}`}>
              Revisar
            </Link>
            <form action={readAlert}>
              <input type="hidden" name="id" value={al.id} />
              <button className="btn sm ghost">Ocultar</button>
            </form>
          </div>
        </div>
      ))}

      {pending.length > 0 && (
        <>
          <div className="eyebrow">Por aprobar · {pending.length}</div>
          <div className="stack">
            {pending.map((a) => (
              <PendingCard key={a.id} a={a} now={now} owner={owner} backTo={backTo} />
            ))}
          </div>
        </>
      )}

      {owner && (branches.length > 1 || barbers.length > 1) && (
        <>
          <div className="eyebrow">Ver</div>
          {branches.length > 1 && (
            <div className="seg" style={{ marginBottom: 10 }}>
              <Link href={qs({ sede: '', barbero: '' })} className={!branchF ? 'on' : ''}>
                Todas las sedes
              </Link>
              {branches.map((b) => (
                <Link key={b.id} href={qs({ sede: b.id, barbero: '' })} className={branchF === b.id ? 'on' : ''}>
                  {b.name}
                </Link>
              ))}
            </div>
          )}
          <div className="bfilter">
            <Link href={qs({ barbero: '' })} className={'bchip' + (!barberF ? ' on' : '')}>
              <span className="av any">
                <Icon name="users" />
              </span>
              <span>Todos</span>
            </Link>
            {barbers.map((b) => (
              <Link key={b.id} href={qs({ barbero: b.id })} className={'bchip' + (barberF === b.id ? ' on' : '')}>
                <Avatar name={b.name} />
                <span>{firstName(b.name)}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="eyebrow">Día</div>
      <div className="days">
        {Array.from({ length: 10 }, (_, i) => addDaysYmd(today, i - 2)).map((d) => {
          const f = fmtYmdShort(d)
          return (
            <Link key={d} href={qs({ date: d })} className={'day' + (d === date ? ' on' : '')} aria-current={d === date ? 'date' : undefined}>
              <small>{d === today ? 'Hoy' : f.wd}</small>
              <b>{f.day}</b>
              <em>{f.mo}</em>
            </Link>
          )
        })}
      </div>

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi">
          <small>Citas</small>
          <b>{active.length}</b>
          <span className="ksub">{active.filter((a) => a.status === 'completed').length} atendidas</span>
        </div>
        <div className="kpi">
          <small>Cobrado</small>
          <b>{fmtMoney(cash?.total ?? 0)}</b>
          <span className="ksub">{cash?.n ?? 0} pagos</span>
        </div>
      </div>

      <div className="eyebrow">Citas del día</div>
      {day.length === 0 ? (
        <div className="empty">No hay citas este día.</div>
      ) : (
        <div className="tl">
          {day.map((a, i) => {
            const prev = day[i - 1]
            const showNow = isToday && new Date(a.starts_at) > now && (!prev || new Date(prev.starts_at) <= now)
            const inProgress = isToday && new Date(a.starts_at) <= now && new Date(a.ends_at) > now && a.status === 'confirmed'
            return (
              <div key={a.id}>
                {showNow && <div className="nowline">Ahora · {fmtTime(now, tz)}</div>}
                <Link href={`/app/cita/${a.id}`} className={'ap tap' + (['completed', 'cancelled', 'no_show'].includes(a.status) ? ' done' : '') + (inProgress ? ' now' : '')}>
                  <div className="h">
                    {a.time}
                    <small>{a.duration_min} min</small>
                  </div>
                  <div className="b">
                    <div className="grow">
                      <div className="who">{a.client_name}</div>
                      <div className="small muted">
                        {a.service_name}
                        {owner ? ` · ${firstName(a.barber_name)}` : ''}
                        {owner && !branchF && branches.length > 1 ? ` · ${a.branch_name}` : ''}
                      </div>
                      {a.client_note && <div className="small" style={{ marginTop: 3 }}>“{a.client_note}”</div>}
                    </div>
                    <div className="right">
                      <StatusPill status={a.status} />
                      {a.status === 'confirmed' && (isToday || date < today) && <div className="small" style={{ color: 'var(--brass)', marginTop: 6, fontWeight: 700 }}>Cobrar →</div>}
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

function PendingCard({ a, now, owner, backTo }: { a: ApptView; now: Date; owner: boolean; backTo: string }) {
  const deadline = a.approval_deadline ? new Date(a.approval_deadline) : null
  const created = new Date(a.created_at)
  const total = deadline ? deadline.getTime() - created.getTime() : 1
  const left = deadline ? deadline.getTime() - now.getTime() : 0
  const late = left <= 0
  const pct = Math.max(0, Math.min(100, (left / total) * 100))
  const mins = Math.max(0, Math.round(left / 60000))
  return (
    <div className="pending">
      <div className="timer">
        <Icon name="clock" />
        {late ? 'Venció el plazo para responder' : `Responde en ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`}
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%`, background: late ? 'var(--bad)' : undefined }} />
      </div>
      <Link href={`/app/cita/${a.id}`} className="row" style={{ marginTop: 12 }}>
        <Avatar name={a.client_name} />
        <div className="grow">
          <div style={{ fontWeight: 700 }}>{a.client_name}</div>
          <div className="small muted">
            {a.service_name} · {a.day} · {a.time}
            {owner ? ` · ${firstName(a.barber_name)}` : ''}
          </div>
          {a.client_note && <div className="small" style={{ marginTop: 3 }}>“{a.client_note}”</div>}
        </div>
      </Link>
      <div className="row" style={{ marginTop: 12 }}>
        <form action={rejectAction} style={{ flex: 1 }}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="back" value={backTo} />
          <button className="btn sm no" style={{ width: '100%' }}>
            <Icon name="x" /> Rechazar
          </button>
        </form>
        <form action={approveAction} style={{ flex: 2 }}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="back" value={backTo} />
          <button className="btn sm ok" style={{ width: '100%' }}>
            <Icon name="check" /> Confirmar
          </button>
        </form>
      </div>
    </div>
  )
}
