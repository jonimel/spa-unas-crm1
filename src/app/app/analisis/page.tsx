import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar, METHOD_LABEL, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { statsFor, type View } from '@/lib/analytics'
import { rows } from '@/lib/db'
import { monthAfter, monthBefore } from '@/lib/periods'
import { firstName } from '@/lib/phone'
import { fmtMoney, plural, todayYmd } from '@/lib/time'

const VIEWS: [View, string][] = [
  ['hoy', 'Hoy'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
]

function Delta({ d }: { d: number | null }) {
  if (d === null) return null
  return <span className={d >= 0 ? 'delta-up' : 'delta-down'}>{d >= 0 ? `▲ ${d}%` : `▼ ${Math.abs(d)}%`}</span>
}

const heatBg = (p: number | null) => (p === null ? 'var(--surface-2)' : `rgba(var(--brass-rgb),${(0.1 + (p / 100) * 0.9).toFixed(2)})`)

export default async function Analisis({ searchParams }: PageProps<'/app/analisis'>) {
  const user = await requireUser('owner')
  const sp = await searchParams
  const tz = user.timezone
  const view: View = sp.vista === 'hoy' || sp.vista === 'mes' ? sp.vista : 'semana'
  const thisMonth = todayYmd(tz).slice(0, 8) + '01'
  const month = typeof sp.mes === 'string' && /^\d{4}-\d{2}$/.test(sp.mes) && `${sp.mes}-01` <= thisMonth ? `${sp.mes}-01` : thisMonth
  const branches = await rows<{ id: string; name: string }>('select id, name from branches where tenant_id = $1 and active order by sort', [user.tenant_id])
  const sede = typeof sp.sede === 'string' && branches.some((b) => b.id === sp.sede) ? sp.sede : null
  const st = await statsFor(user.tenant_id, tz, view, month, sede)
  const hasBarbers = (await rows(`select 1 from users where tenant_id = $1 and role = 'barber' and active limit 1`, [user.tenant_id])).length > 0

  const qs = (o: { vista?: View; mes?: string | null; sede?: string | null }) => {
    const q = new URLSearchParams()
    const v = o.vista ?? view
    if (v !== 'semana') q.set('vista', v)
    const m = o.mes === undefined ? month.slice(0, 7) : o.mes
    if (v === 'mes' && m && m !== thisMonth.slice(0, 7)) q.set('mes', m)
    const s = o.sede === undefined ? sede : o.sede
    if (s) q.set('sede', s)
    const str = q.toString()
    return `/app/analisis${str ? `?${str}` : ''}`
  }

  const series = view === 'mes' ? st.months : st.week
  const maxBar = Math.max(1, ...series.map((m) => m.total))
  const unit = view === 'mes' ? 1e6 : 1e3
  const fmtUnit = (n: number) => (view === 'mes' ? (n / unit).toFixed(1) : String(Math.round(n / unit)))

  return (
    <main>
      <Top
        title="Análisis"
        sub={`${st.title} · vs. ${st.vs}`}
        act={
          view === 'mes' ? (
            <div className="monthnav">
              <Link href={qs({ mes: monthBefore(month).slice(0, 7) })} aria-label="Mes anterior">
                <Icon name="back" />
              </Link>
              <Link href={qs({ mes: monthAfter(month).slice(0, 7) })} aria-label="Mes siguiente" aria-disabled={month >= thisMonth}>
                <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="seg" role="group" aria-label="Periodo">
        {VIEWS.map(([v, l]) => (
          <Link key={v} href={qs({ vista: v, mes: null })} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined}>
            {l}
          </Link>
        ))}
      </div>
      {branches.length > 1 && (
        <div className="seg" role="group" aria-label="Ver datos de" style={{ marginTop: 8 }}>
          <Link href={qs({ sede: null })} className={!sede ? 'on' : ''}>
            Toda la red
          </Link>
          {branches.map((b) => (
            <Link key={b.id} href={qs({ sede: b.id })} className={sede === b.id ? 'on' : ''}>
              {b.name}
            </Link>
          ))}
        </div>
      )}

      {st.insights.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>
            Lo que vemos
          </div>
          <div className="stack">
            {st.insights.map((i, k) => (
              <div key={k} className="ins">
                <span className={`pill ${i.tone}`}>
                  <Icon name={i.tone === 'warn' ? 'clock' : i.tone === 'ok' ? 'check' : 'star'} size={14} />
                  {i.tone === 'warn' ? 'Para mejorar' : i.tone === 'ok' ? 'Bien' : 'Oportunidad'}
                </span>
                <p>{i.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="eyebrow">Indicadores</div>
      <div className="kpis">
        <div className="kpi hero">
          <small>Ingresos por servicios</small>
          <b>{fmtMoney(st.revenue)}</b>
          <span className="ksub">
            {st.deltaRevenue === null ? (
              `Sin cobros ${st.vs} para comparar`
            ) : (
              <>
                <Delta d={st.deltaRevenue} /> vs. {st.vs}
              </>
            )}
          </span>
        </div>
        <div className="kpi">
          <small>Visitas</small>
          <b>{st.visits}</b>
          <span className="ksub">
            <Delta d={st.deltaVisits} />
          </span>
        </div>
        <div className="kpi">
          <small>Ticket promedio</small>
          <b>{fmtMoney(st.ticket)}</b>
          <span className="ksub">
            <Delta d={st.deltaTicket} />
          </span>
        </div>
        <div className="kpi">
          <small>Ocupación</small>
          <b>{st.occupancy}%</b>
          <span className="ksub">de las horas de trabajo</span>
        </div>
        <div className="kpi">
          <small>Propinas</small>
          <b>{fmtMoney(st.tips)}</b>
          <span className="ksub">aparte de los ingresos</span>
        </div>
        <div className="kpi">
          <small>Clientas nuevas</small>
          <b>{st.newClients}</b>
          <span className="ksub">{st.returningPct}% ya eran clientas</span>
        </div>
        <div className="kpi">
          <small>No vinieron</small>
          <b>{st.noShows}</b>
          <span className="ksub">{st.noShowPct}% de las citas</span>
        </div>
      </div>

      <div className="eyebrow">{view === 'mes' ? 'Ingresos por mes · millones COP' : 'Cobrado por día · esta semana · miles COP'}</div>
      <div className="card">
        <div className="chart" role="img" aria-label={series.map((m) => `${m.label}: ${fmtMoney(m.total)}`).join('; ')}>
          {series.map((m) => (
            <div key={m.key} className={'c' + (m.current ? ' today' : '')} title={`${m.label}: ${fmtMoney(m.total)}`} style={m.future ? { opacity: 0.35 } : undefined}>
              <i style={{ height: `${Math.max(2, (m.total / maxBar) * 100)}%` }}>{m.current && m.total > 0 && <b>{fmtUnit(m.total)}</b>}</i>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
        <details className="tbl">
          <summary>Ver como tabla</summary>
          <table>
            <thead>
              <tr>
                <th>{view === 'mes' ? 'Mes' : 'Día'}</th>
                <th>Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {series.map((m) => (
                <tr key={m.key}>
                  <td>
                    {m.label} {view === 'mes' ? m.key.slice(0, 4) : Number(m.key.slice(8))}
                  </td>
                  <td>{fmtMoney(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {view !== 'hoy' && st.heat.length > 0 && (
        <>
          <div className="eyebrow">Ocupación por día y hora</div>
          <div className="card">
            <div className="heat" role="table" aria-label="Porcentaje de ocupación por día y bloque de horas">
              <span role="columnheader" />
              {st.heat[0].cells.map((c) => (
                <span key={c.block} className="hh" role="columnheader">
                  {c.block}
                </span>
              ))}
              {st.heat.map((r) => [
                <span key={r.wd} className="hl" role="rowheader">
                  {r.label}
                </span>,
                ...r.cells.map((c) => (
                  <span
                    key={`${r.wd}-${c.block}`}
                    role="cell"
                    className={'hc' + (c.pct === null ? ' lo' : c.pct >= 60 ? ' hi' : c.pct < 25 ? ' lo' : '')}
                    style={{ background: heatBg(c.pct) }}
                    title={`${r.label} ${c.block}: ${c.pct === null ? 'sin horario' : `${c.pct}% ocupado`}`}
                  >
                    {c.pct === null ? '—' : c.pct}
                  </span>
                )),
              ])}
            </div>
            <div className="hscale" aria-hidden="true">
              Vacío <i style={{ background: heatBg(5) }} />
              <i style={{ background: heatBg(30) }} />
              <i style={{ background: heatBg(55) }} />
              <i style={{ background: heatBg(80) }} />
              <i style={{ background: heatBg(100) }} /> Lleno · % de horas reservadas
            </div>
          </div>
        </>
      )}

      <div className="eyebrow">Qué se vende · % de los ingresos</div>
      <div className="card mix">
        {st.services.length === 0 && <span className="muted">Sin ventas en este periodo.</span>}
        {st.services.map((s) => [
          <span key={`${s.name}-n`} className="nm">
            {s.name}
          </span>,
          <span key={`${s.name}-p`} className="pc" title={fmtMoney(s.value)}>
            {s.pct}%
          </span>,
          <span key={`${s.name}-t`} className="tr">
            <i style={{ width: `${s.pct}%` }} />
          </span>,
        ])}
      </div>

      <div className="eyebrow">Cómo pagan · % de lo cobrado</div>
      <div className="card mix">
        {st.methods.length === 0 && <span className="muted">Sin pagos en este periodo.</span>}
        {st.methods.map((m) => [
          <span key={`${m.name}-n`} className="nm">
            {METHOD_LABEL[m.name] ?? m.name}
          </span>,
          <span key={`${m.name}-p`} className="pc" title={fmtMoney(m.value)}>
            {m.pct}%
          </span>,
          <span key={`${m.name}-t`} className="tr">
            <i style={{ width: `${m.pct}%` }} />
          </span>,
        ])}
      </div>

      <div className="eyebrow">Manicuristas</div>
      {!hasBarbers ? (
        <div className="empty">
          Todavía no tienes manicuristas.{' '}
          <Link className="link" href="/app/ajustes/manicurista/nuevo">
            Agregar manicurista →
          </Link>
        </div>
      ) : st.byBarber.length === 0 ? (
        <div className="empty plain">Sin visitas en este periodo.</div>
      ) : null}
      <div className="card list" style={{ paddingBlock: 4, display: st.byBarber.length ? undefined : 'none' }}>
        {st.byBarber.map((b) => (
          <div key={b.id} className="li">
            <Avatar name={b.name} sm />
            <div className="grow">
              <div className="t">{firstName(b.name)}</div>
              <div className="small muted">
                {plural(b.visits, 'visita', 'visitas')} · ticket {fmtMoney(b.ticket)}
                {b.occupancy !== null ? ` · ocupación ${b.occupancy}%` : ''}
              </div>
            </div>
            <b className="num">{fmtMoney(b.revenue)}</b>
          </div>
        ))}
      </div>
    </main>
  )
}
