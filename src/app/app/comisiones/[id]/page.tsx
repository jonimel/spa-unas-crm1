import Link from 'next/link'
import { isUuid } from '@/lib/validate'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Flash, METHOD_LABEL, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { computeShare, PAYOUT_KIND_LABEL, PAYOUT_METHODS, type Scheme } from '@/lib/commission'
import { one, rows } from '@/lib/db'
import { ledgers, payoutsFor, schemesFor, shopRules, type Ledger, type PayoutRow } from '@/lib/payroll'
import { period } from '@/lib/periods'
import { fmtDayShort as dayLabel, fmtMoney, plural, todayYmd } from '@/lib/time'
import { recordPayout, saveBarberScheme, voidPayout } from '../../actions'

const UUID = { test: isUuid }
const METHOD_ICON: Record<string, string> = { efectivo: 'cash', nequi: 'phone', daviplata: 'phone', transferencia: 'link' }
const UNIT: Record<string, string> = { daily: 'diario', weekly: 'semanal', monthly: 'mensual' }

const plain = (n: number) => Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')

export default async function Manicurista({ params, searchParams }: PageProps<'/app/comisiones/[id]'>) {
  const user = await requireUser('owner')
  const { id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const b = await one<{ id: string; name: string; branch: string | null }>(
    `select u.id, u.name, br.name branch from users u left join branches br on br.id = u.branch_id where u.id = $1 and u.tenant_id = $2 and u.role = 'barber'`,
    [id, user.tenant_id],
  )
  if (!b) notFound()
  const tab = sp.tab === 'esquema' ? 'esquema' : 'pagos'
  const shop = await shopRules(user.tenant_id)
  const scheme: Scheme = (await schemesFor(user.tenant_id)).get(id) ?? { model: 'percent', percent: null, rentAmount: null, rentPeriod: null, rates: {} }

  return (
    <main>
      <Top title={b.name} sub={b.branch ?? 'Sin sede'} back="/app/comisiones" />
      <Flash ok={sp.ok as string} err={sp.err as string} />
      <div className="seg" style={{ marginTop: 12 }} role="group" aria-label="Sección">
        <Link href={`/app/comisiones/${id}`} className={tab === 'pagos' ? 'on' : ''} aria-current={tab === 'pagos' ? 'page' : undefined}>
          Pagos
        </Link>
        <Link href={`/app/comisiones/${id}?tab=esquema`} className={tab === 'esquema' ? 'on' : ''} aria-current={tab === 'esquema' ? 'page' : undefined}>
          Esquema de pago
        </Link>
      </div>
      {tab === 'pagos' ? <Payments tenantId={user.tenant_id} tz={user.timezone} id={id} scheme={scheme} all={sp.mov === 'todos'} /> : <SchemeEditor tenantId={user.tenant_id} tz={user.timezone} id={id} scheme={scheme} shop={shop} />}
    </main>
  )
}

// ---------------- pagos: saldo, registrar y movimientos ----------------

const SHOW = 12

async function Payments({ tenantId, tz, id, scheme, all }: { tenantId: string; tz: string; id: string; scheme: Scheme; all: boolean }) {
  const today = todayYmd(tz)
  const l: Ledger = (await ledgers(tenantId, today, id)).get(id)!
  const moves = await payoutsFor(tenantId, id, all ? 2000 : SHOW + 1)
  const more = !all && moves.length > SHOW
  if (more) moves.length = SHOW
  const start = (await one<{ d: string }>(`select to_char(ledger_start at time zone $2, 'YYYY-MM-DD') d from tenants where id = $1`, [tenantId, tz]))!.d
  const rent = scheme.model === 'rent'
  const suggested = rent ? (l.rentOwed > 0 ? l.rentOwed : (scheme.rentAmount ?? 0)) : Math.max(l.owed, 0)

  return (
    <>
      <div className="kpis" style={{ marginTop: 14 }}>
        {rent ? (
          <div className="kpi hero">
            <small>{l.rentOwed > 0 ? 'Debe de arriendo' : l.rentOwed < 0 ? 'Arriendo pagado por adelantado' : 'Arriendo al día'}</small>
            <b>{fmtMoney(Math.abs(l.rentOwed))}</b>
            <span className="ksub">
              {fmtMoney(scheme.rentAmount ?? 0)} {UNIT[scheme.rentPeriod ?? 'weekly']}
              {scheme.rentSince ? ` desde el ${dayLabel(scheme.rentSince)}` : ''} · pagó {fmtMoney(l.rentPaid)} de {fmtMoney(l.rentDue)}
            </span>
            {l.last && (
              <span className="ksub">
                Último pago: {fmtMoney(l.last.amount)} · {dayLabel(l.last.paid_on)}
              </span>
            )}
          </div>
        ) : (
          <div className="kpi hero">
            <small>{l.owed < 0 ? 'Se le adelantó de más' : 'Por pagar hoy'}</small>
            <b>{fmtMoney(Math.abs(l.owed))}</b>
            <span className="ksub">
              {l.owed < 0
                ? 'Se descuenta de lo que vaya ganando'
                : `Ganó ${fmtMoney(l.earned)} desde el ${dayLabel(start)} y se le pagó ${fmtMoney(l.paid)}`}
            </span>
            <span className="ksub">{l.last ? `Último pago: ${fmtMoney(l.last.amount)} · ${dayLabel(l.last.paid_on)}` : 'Todavía no hay pagos registrados'}</span>
          </div>
        )}
      </div>

      <div className="eyebrow">{rent ? 'Registrar pago de arriendo' : 'Registrar pago'}</div>
      <form action={recordPayout} className="card stack">
        <input type="hidden" name="id" value={id} />
        {rent ? (
          <input type="hidden" name="kind" value="arriendo" />
        ) : (
          <div className="seg" role="radiogroup" aria-label="Tipo de pago">
            <label>
              <input type="radio" name="kind" value="pago" defaultChecked />
              Pago
            </label>
            <label>
              <input type="radio" name="kind" value="adelanto" />
              Adelanto
            </label>
          </div>
        )}
        <label className="big-in" htmlFor="amount">
          <b>$</b>
          <input id="amount" name="amount" inputMode="numeric" data-money="" defaultValue={suggested > 0 ? plain(suggested) : ''} placeholder="0" className="big-num" aria-label="Valor" required />
        </label>
        <div className="pay two" role="radiogroup" aria-label="Cómo se pagó">
          {PAYOUT_METHODS.map((m, i) => (
            <label key={m}>
              <input type="radio" name="method" value={m} defaultChecked={i === 0} />
              <Icon name={METHOD_ICON[m]} />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
        <div className="field">
          <label htmlFor="date">Fecha</label>
          <div className="in">
            <input type="date" id="date" name="date" defaultValue={today} max={today} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">Nota (opcional)</label>
          <div className="in">
            <input id="note" name="note" maxLength={120} placeholder={rent ? 'Ej.: semana del 9 nov' : 'Ej.: semana 9 – 15 nov'} />
          </div>
        </div>
        <button className="btn">
          <Icon name="check" /> {rent ? 'Registrar arriendo' : 'Registrar pago'}
        </button>
      </form>
      {!rent && (
        <p className="small muted" style={{ margin: '8px 2px 0' }}>
          El adelanto es plata que se le da antes de tiempo: se descuenta de lo que va ganando, igual que un pago.
        </p>
      )}

      <div className="eyebrow">Movimientos</div>
      {moves.length === 0 ? (
        <div className="empty">Todavía no hay pagos registrados.</div>
      ) : (
        <div className="card list" style={{ paddingBlock: 4 }}>
          {moves.map((m) => (
            <Move key={m.id} m={m} barberId={id} />
          ))}
        </div>
      )}
      {more && (
        <Link href={`/app/comisiones/${id}?mov=todos`} className="link" style={{ display: 'flex', alignItems: 'center', margin: '4px 2px 0' }}>
          Ver todos los movimientos
        </Link>
      )}
      {moves.length > 0 && (
        <p className="small muted" style={{ margin: '8px 2px 0' }}>
          Toca un movimiento para ver el detalle o anularlo si se registró por error.
        </p>
      )}
    </>
  )
}

function Move({ m, barberId }: { m: PayoutRow; barberId: string }) {
  return (
    <details className={`mv${m.voided ? ' void' : ''}`}>
      <summary className="li">
        <span className={`mv-ic ${m.kind}`} aria-hidden="true">
          <Icon name={m.kind === 'arriendo' ? 'home' : m.kind === 'adelanto' ? 'clock' : 'cash'} />
        </span>
        <div className="grow">
          <div className="t">
            {PAYOUT_KIND_LABEL[m.kind]} {m.voided && <span className="pill dim">Anulado</span>}
          </div>
          <div className="small muted">
            {dayLabel(m.paid_on)} · {METHOD_LABEL[m.method] ?? m.method}
          </div>
        </div>
        <b className="num">{fmtMoney(m.amount)}</b>
      </summary>
      <div className="mv-more">
        {m.note && <div className="small">{m.note}</div>}
        <div className="small muted">Registrado por {m.by ?? '—'}</div>
        {!m.voided && (
          <form action={voidPayout}>
            <input type="hidden" name="id" value={barberId} />
            <input type="hidden" name="payout" value={m.id} />
            <button className="btn no sm">Anular este movimiento</button>
          </form>
        )}
      </div>
    </details>
  )
}

// ---------------- esquema de pago ----------------

async function SchemeEditor({ tenantId, tz, id, scheme, shop }: { tenantId: string; tz: string; id: string; scheme: Scheme; shop: Awaited<ReturnType<typeof shopRules>> }) {
  const services = await rows<{ id: string; name: string; price: number }>('select id, name, price from services where tenant_id = $1 and active order by is_addon, sort, name', [tenantId])
  // simulación: los cobros de esta semana recalculados con el esquema guardado
  const wk = period('semana', tz)
  const pays = await rows<{ amount: number; tip: number; method: string; service_id: string | null; lines: { serviceId: string | null; price: number }[] | null }>(
    `select p.amount, p.tip, p.method::text, p.service_id,
            (select json_agg(json_build_object('serviceId', x.service_id, 'price', x.price) order by x.sort) from appointment_services x where x.appointment_id = p.appointment_id) lines
       from payments p where p.barber_id = $1 and p.paid_at >= $2 and p.paid_at < $3`,
    [id, wk.start, wk.end],
  )
  // con varios servicios en la cita, la regla de cada servicio se aplica a su parte
  const sim = pays.reduce((s, p) => s + computeShare({ amount: p.amount, tip: p.tip, method: p.method, serviceId: p.service_id, lines: p.lines ?? undefined }, scheme, shop).barberShare, 0)
  const simSales = pays.reduce((s, p) => s + p.amount, 0)

  return (
    <form action={saveBarberScheme} className="scheme">
      <input type="hidden" name="id" value={id} />
      <div className="eyebrow">Tipo de esquema</div>
      <div className="seg" role="radiogroup" aria-label="Tipo de esquema">
        <label>
          <input type="radio" name="model" value="percent" defaultChecked={scheme.model === 'percent'} />
          Porcentaje
        </label>
        <label>
          <input type="radio" name="model" value="fixed" defaultChecked={scheme.model === 'fixed'} />
          Monto fijo
        </label>
        <label>
          <input type="radio" name="model" value="rent" defaultChecked={scheme.model === 'rent'} />
          Arriendo puesto
        </label>
      </div>

      <div className="panel-percent">
        <div className="eyebrow">Porcentaje general</div>
        <label className="big-in" htmlFor="percent">
          <input
            id="percent"
            name="percent"
            inputMode="decimal"
            defaultValue={scheme.percent ?? ''}
            placeholder={String(shop.defaultPct)}
            className="big-num pct"
            aria-label="Porcentaje general"
          />
          <span className="muted" style={{ fontSize: 20 }}>
            %
          </span>
          <span className="grow" />
          <span className="small muted">vacío = {shop.defaultPct}% por defecto</span>
        </label>
      </div>

      <div className="panel-rates">
        <div className="eyebrow">
          <span className="only-percent">Excepciones por servicio</span>
          <span className="only-fixed">Monto fijo por servicio</span>
        </div>
        <p className="small muted only-percent" style={{ margin: '0 2px 8px' }}>
          Déjalo en “General” para usar el porcentaje de arriba.
        </p>
        <p className="small muted only-fixed" style={{ margin: '0 2px 8px' }}>
          Cuánto gana la manicurista por cada servicio. Si un servicio queda sin monto, se usa el porcentaje general.
        </p>
        <div className="stack">
          {services.map((s) => {
            const r = scheme.rates[s.id]
            return (
              <div key={s.id} className="rule rate-row">
                <div className="grow">
                  <b>{s.name}</b>
                  <div className="small muted">Precio {fmtMoney(s.price)}</div>
                </div>
                <select name={`kind_${s.id}`} defaultValue={r?.kind ?? ''} aria-label={`Tipo para ${s.name}`} className="mini-sel">
                  <option value="">General</option>
                  <option value="percent">%</option>
                  <option value="fixed">$ fijo</option>
                </select>
                <input name={`value_${s.id}`} inputMode="decimal" data-money="rate" defaultValue={r ? (r.kind === 'fixed' ? plain(r.value) : String(r.value)) : ''} className="mini-in" aria-label={`Valor para ${s.name}`} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel-rent">
        <div className="eyebrow">Arriendo de puesto</div>
        <label className="big-in" htmlFor="rent">
          <b>$</b>
          <input id="rent" name="rentAmount" inputMode="numeric" data-money="" defaultValue={scheme.rentAmount ? plain(scheme.rentAmount) : ''} placeholder="350.000" className="big-num" aria-label="Valor del arriendo" />
        </label>
        <div className="chips" style={{ marginTop: 10 }}>
          {(
            [
              ['daily', 'Diario'],
              ['weekly', 'Semanal'],
              ['monthly', 'Mensual'],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="chip">
              <input type="radio" name="rentPeriod" value={v} defaultChecked={(scheme.rentPeriod ?? 'weekly') === v} />
              {l}
            </label>
          ))}
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          La manicurista se queda con el 100% de lo que cobra y paga el arriendo al spa. El arriendo se cuenta por periodo empezado, desde el día en que pasa a
          arriendo.
        </div>
      </div>

      <div className="eyebrow">Simulación · esta semana</div>
      <div className="card row">
        <div className="grow small muted">
          {plural(pays.length, 'visita', 'visitas')} · {fmtMoney(simSales)} en ventas
        </div>
        <b className="num" style={{ color: 'var(--brass)' }}>
          {scheme.model === 'rent' ? fmtMoney(simSales) : fmtMoney(sim)}
        </b>
      </div>
      <p className="small muted" style={{ margin: '8px 2px 0' }}>
        Con el esquema guardado. Los cambios aplican a los cobros desde hoy; lo ya cobrado no cambia.
      </p>

      <div className="cta">
        <button className="btn">Guardar esquema</button>
      </div>
    </form>
  )
}
