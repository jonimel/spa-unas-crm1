import Link from 'next/link'
import { isUuid } from '@/lib/validate'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, StatusPill, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { apptList } from '@/lib/booking'
import { one } from '@/lib/db'
import { firstName, fmtPhone } from '@/lib/phone'
import { fmtDay, fmtMoney } from '@/lib/time'
import { saveClientNotes } from '../../actions'

const UUID = { test: isUuid }

export default async function Cliente({ params, searchParams }: PageProps<'/app/clientes/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const c = await one<{ id: string; name: string; phone: string | null; notes: string | null; favorite_colors: string | null; allergies: string | null; created_at: Date }>(
    'select id, name, phone, notes, favorite_colors, allergies, created_at from clients where id = $1 and tenant_id = $2',
    [id, user.tenant_id],
  )
  if (!c) notFound()
  const history = await apptList('a.client_id = $1', [id], 'a.starts_at desc')
  const done = history.filter((a) => a.status === 'completed')
  const spent = done.reduce((s, a) => s + (a.paid_amount ?? 0) + (a.paid_tip ?? 0), 0)
  const noShows = history.filter((a) => a.status === 'no_show').length
  const most = (names: string[]) => {
    const m = new Map<string, number>()
    for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—'
  }
  // servicio habitual: cada servicio principal de la cita cuenta (un adicional como "Retiro" no es "el servicio")
  const usualService = most(done.flatMap((a) => a.lines.filter((l) => !l.is_addon).map((l) => l.name)))
  const usualBarber = most(done.map((a) => a.barber_name))
  const owner = user.role === 'owner'
  const tz = user.timezone
  const next = history.filter((a) => ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at) > new Date()).reverse()[0]

  return (
    <main>
      <Top title="Clienta" back="/app/clientes" />
      <Flash ok={sp.ok as string} />
      <div className="profile-head">
        <Avatar name={c.name} />
        <div>
          <h2>{c.name}</h2>
          <div className="small muted">
            {c.phone ? `+57 ${fmtPhone(c.phone)}` : 'Sin celular'} · clienta desde {fmtDay(new Date(c.created_at), tz)}
          </div>
        </div>
      </div>
      {c.allergies && (
        <div className="alert-allergy" role="note" style={{ marginTop: 12 }}>
          <Icon name="alert" />
          <div>
            <b>Alergias y sensibilidades</b>
            {c.allergies}
          </div>
        </div>
      )}
      {c.phone && (
        <a className="btn wa sm" style={{ marginTop: 12 }} href={`https://wa.me/57${c.phone}`} target="_blank" rel="noreferrer">
          <Icon name="wa" /> Escribir por WhatsApp
        </a>
      )}

      <div className={'kpis' + (owner ? '' : '')} style={{ marginTop: 14 }}>
        <div className="kpi">
          <small>Visitas</small>
          <b>{done.length}</b>
          <span className="ksub">{noShows ? `${noShows} no vino` : 'sin faltas'}</span>
        </div>
        {owner ? (
          <div className="kpi">
            <small>Ha gastado</small>
            <b>{fmtMoney(spent)}</b>
            <span className="ksub">promedio {fmtMoney(done.length ? spent / done.length : 0)}</span>
          </div>
        ) : (
          <div className="kpi">
            <small>Última visita</small>
            <b style={{ fontSize: 22 }}>{done[0] ? fmtDay(new Date(done[0].starts_at), tz) : '—'}</b>
          </div>
        )}
        <div className="kpi">
          <small>Servicio habitual</small>
          <b style={{ fontSize: 20 }}>{usualService}</b>
        </div>
        <div className="kpi">
          <small>Manicurista habitual</small>
          <b style={{ fontSize: 20 }}>{usualBarber === '—' ? '—' : firstName(usualBarber)}</b>
        </div>
      </div>

      {next &&
        (() => {
          const body = (
            <>
              <Icon name="cal" style={{ color: 'var(--brass)' }} />
              <div className="grow">
                <b>Próxima cita</b>
                <div className="small muted">
                  {next.day} · {next.time} · {next.service_name} con {firstName(next.barber_name)}
                </div>
              </div>
              <StatusPill status={next.status} />
            </>
          )
          const style = { marginTop: 10, borderColor: 'rgba(var(--brass-rgb),.45)' }
          // la cita de otra manicurista se ve, pero no se abre (no puede tocarla)
          return owner || next.barber_id === user.id ? (
            <Link href={`/app/cita/${next.id}`} className="card row" style={style}>
              {body}
            </Link>
          ) : (
            <div className="card row" style={style}>
              {body}
            </div>
          )
        })()}

      <div className="eyebrow">Ficha</div>
      <form action={saveClientNotes} className="stack">
        <input type="hidden" name="id" value={c.id} />
        <div className="field">
          <label htmlFor="allergies">Alergias o sensibilidades</label>
          <div className="in">
            <input id="allergies" name="allergies" defaultValue={c.allergies ?? ''} maxLength={300} placeholder="Ej.: látex, monómero del acrílico, piel sensible" />
          </div>
          <div className="hint">Se le muestra al equipo en la agenda, la cita y el cobro.</div>
        </div>
        <div className="field">
          <label htmlFor="colors">Colores y tonos favoritos</label>
          <div className="in">
            <input id="colors" name="favorite_colors" defaultValue={c.favorite_colors ?? ''} maxLength={300} placeholder="Ej.: nude rosado, rojo cereza, francés" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">Notas</label>
          <div className="in">
            <textarea id="notes" name="notes" defaultValue={c.notes ?? ''} placeholder="Forma y largo que le gustan, preferencias…" />
          </div>
        </div>
        <button className="btn ghost sm">Guardar ficha</button>
      </form>

      <div className="eyebrow">Historial</div>
      {history.length === 0 ? (
        <div className="empty">Todavía no tiene visitas.</div>
      ) : (
        <div className="list">
          {history.slice(0, 30).map((a) => (
            <Link key={a.id} href={`/app/cita/${a.id}`} className="li" style={{ pointerEvents: owner || a.barber_id === user.id ? undefined : 'none' }}>
              <div className="grow">
                <div className="t">{a.service_name}</div>
                <div className="small muted">
                  {a.day} · {firstName(a.barber_name)} · {a.branch_name}
                </div>
              </div>
              <div className="right">
                <StatusPill status={a.status} />
                {owner && a.paid_amount !== null && <div className="small muted num" style={{ marginTop: 4 }}>{fmtMoney(a.paid_amount + (a.paid_tip ?? 0))}</div>}
              </div>
            </Link>
          ))}
          {history.length > 30 && <div className="small muted" style={{ padding: '12px 0' }}>Y {history.length - 30} visitas más antiguas.</div>}
        </div>
      )}
    </main>
  )
}
