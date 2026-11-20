import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, METHOD_LABEL, Top } from '@/components/ui'
import { requireUser, type CurrentUser } from '@/lib/auth'
import { PAYOUT_KIND_LABEL, rentForPeriod, schemeSummary } from '@/lib/commission'
import { rows } from '@/lib/db'
import { breakdownByService, ledgers, payoutsFor, schemesFor, shopRules, totalsByBarber } from '@/lib/payroll'
import { asPeriodKey, period, PERIOD_LABEL, type Period, type PeriodKey } from '@/lib/periods'
import { fmtDayShort, fmtMoney, plural, todayYmd } from '@/lib/time'
import { saveShopRules } from '../actions'

export default async function Comisiones({ searchParams }: PageProps<'/app/comisiones'>) {
  const user = await requireUser()
  const sp = await searchParams
  return user.role === 'owner' ? <OwnerView user={user} sp={sp} /> : <BarberView user={user} sp={sp} />
}

type SP = Record<string, string | string[] | undefined>

function PeriodTabs({ keys, current, base }: { keys: PeriodKey[]; current: PeriodKey; base: string }) {
  return (
    <div className="seg" role="group" aria-label="Periodo">
      {keys.map((k) => (
        <Link key={k} href={`${base}?p=${k}`} className={k === current ? 'on' : ''} aria-current={k === current ? 'page' : undefined}>
          {PERIOD_LABEL[k]}
        </Link>
      ))}
    </div>
  )
}

function rentLine(per: Period, amount: number | null, unit: 'daily' | 'weekly' | 'monthly' | null) {
  if (!amount || !unit) return 0
  return rentForPeriod(amount, unit, per.key === 'hoy' ? 'day' : per.key.startsWith('semana') ? 'week' : 'month', per.days)
}

// ---------------- manicurista: "Mis comisiones" ----------------

async function BarberView({ user, sp }: { user: CurrentUser; sp: SP }) {
  const key = asPeriodKey(sp.p, ['hoy', 'semana', 'mes'], 'semana')
  const per = period(key, user.timezone)
  const [tot] = await totalsByBarber(user.tenant_id, per.start, per.end, { barberId: user.id })
  const lines = await breakdownByService(user.id, per.start, per.end)
  const shop = await shopRules(user.tenant_id)
  const scheme = (await schemesFor(user.tenant_id)).get(user.id) ?? null
  const rent = scheme?.model === 'rent' ? rentLine(per, scheme.rentAmount, scheme.rentPeriod) : 0
  const mine = (tot?.barber_share ?? 0) + (tot?.barber_tip ?? 0)
  const services = await rows<{ id: string; name: string }>('select id, name from services where tenant_id = $1', [user.tenant_id])
  const sName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Servicio'
  const led = (await ledgers(user.tenant_id, todayYmd(user.timezone), user.id)).get(user.id)
  const received = (await payoutsFor(user.tenant_id, user.id, 12)).filter((m) => !m.voided)
  const isRent = scheme?.model === 'rent'

  return (
    <main>
      <div className="top">
        <Avatar name={user.name} sm />
        <div className="tt">
          <h1>Mis pagos</h1>
          <div className="sub">Solo ves lo tuyo</div>
        </div>
      </div>
      {led && (
        <div className="card saldo">
          <div className="grow">
            <b>{isRent ? (led.rentOwed > 0 ? 'Arriendo pendiente' : 'Arriendo al día') : led.owed < 0 ? 'Te adelantaron' : 'Por cobrar hoy'}</b>
            <div className="small muted">
              {led.last ? `Último pago: ${fmtMoney(led.last.amount)} · ${fmtDayShort(led.last.paid_on)}` : 'Todavía no hay pagos registrados'}
            </div>
          </div>
          <b className="num">{fmtMoney(Math.abs(isRent ? Math.max(led.rentOwed, 0) : led.owed))}</b>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <PeriodTabs keys={['hoy', 'semana', 'mes']} current={key} base="/app/comisiones" />
      </div>

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi hero">
          <small>
            {scheme?.model === 'rent' ? 'Cobraste' : 'Te corresponde'} · {per.label}
          </small>
          <b>{fmtMoney(mine)}</b>
          <em>
            {scheme?.model === 'rent'
              ? `Servicios ${fmtMoney(tot?.barber_share ?? 0)} + propinas ${fmtMoney(tot?.barber_tip ?? 0)}`
              : `Comisión ${fmtMoney(tot?.barber_share ?? 0)} + propinas ${fmtMoney(tot?.barber_tip ?? 0)}`}
          </em>
        </div>
        <div className="kpi">
          <small>Servicios</small>
          <b>{tot?.services ?? 0}</b>
        </div>
        <div className="kpi">
          <small>Ventas generadas</small>
          <b>{fmtMoney(tot?.sales ?? 0)}</b>
        </div>
        {scheme?.model === 'rent' && (
          <div className="kpi" style={{ gridColumn: '1 / -1' }}>
            <small>Arriendo de puesto del periodo</small>
            <b>{fmtMoney(rent)}</b>
            <span className="ksub">Lo pagas al spa</span>
          </div>
        )}
      </div>

      <div className="eyebrow">Desglose por servicio</div>
      {lines.length === 0 ? (
        <div className="empty">Todavía no hay servicios cobrados en este periodo.</div>
      ) : (
        <div className="card list" style={{ paddingBlock: 4 }}>
          {lines.map((l) => (
            <div key={l.service} className="li">
              <div className="grow">
                <div className="t">
                  {l.service} × {l.n}
                </div>
                <div className="small muted">
                  {fmtMoney(l.sales)} · {l.rules.join(' / ')}
                </div>
              </div>
              <b className="num">{fmtMoney(l.share)}</b>
            </div>
          ))}
          <div className="li">
            <div className="grow">
              <div className="t">Propinas</div>
              <div className="small muted">{shop.tipsToBarber ? '100% para ti' : 'Quedan para el spa'}</div>
            </div>
            <b className="num">{fmtMoney(tot?.barber_tip ?? 0)}</b>
          </div>
        </div>
      )}

      <div className="note" style={{ marginTop: 14 }}>
        Tu esquema: <b>{schemeSummary(scheme, shop).main}</b>
        {scheme && scheme.model !== 'rent' && Object.keys(scheme.rates).length > 0 && (
          <>
            {' · '}
            {Object.entries(scheme.rates)
              .map(([id, r]) => `${sName(id)} ${r.kind === 'percent' ? `al ${r.value}%` : `${fmtMoney(r.value)} fijo`}`)
              .join(', ')}
          </>
        )}
        . Lo define el dueño.
      </div>

      <div className="eyebrow">{isRent ? 'Arriendos pagados' : 'Pagos recibidos'}</div>
      {received.length === 0 ? (
        <div className="empty">Todavía no hay pagos registrados.</div>
      ) : (
        <div className="card list" style={{ paddingBlock: 4 }}>
          {received.map((m) => (
            <div key={m.id} className="li">
              <div className="grow">
                <div className="t">{PAYOUT_KIND_LABEL[m.kind]}</div>
                <div className="small muted">
                  {fmtDayShort(m.paid_on)} · {METHOD_LABEL[m.method] ?? m.method}
                  {m.note ? ` · ${m.note}` : ''}
                </div>
              </div>
              <b className="num">{fmtMoney(m.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

// ---------------- dueño: comisiones de todo el equipo ----------------

async function OwnerView({ user, sp }: { user: CurrentUser; sp: SP }) {
  const key = asPeriodKey(sp.p, ['semana', 'semana-pasada', 'mes', 'mes-pasado'], 'semana')
  const per = period(key, user.timezone)
  const totals = await totalsByBarber(user.tenant_id, per.start, per.end)
  const shop = await shopRules(user.tenant_id)
  const schemes = await schemesFor(user.tenant_id)
  const led = await ledgers(user.tenant_id, todayYmd(user.timezone))
  const isRent = (id: string) => schemes.get(id)?.model === 'rent'

  // saldo de hoy (no depende del periodo)
  const owedNow = totals.reduce((s, t) => s + (isRent(t.barber_id) ? 0 : Math.max(led.get(t.barber_id)?.owed ?? 0, 0)), 0)
  const rentNow = totals.reduce((s, t) => s + (isRent(t.barber_id) ? Math.max(led.get(t.barber_id)?.rentOwed ?? 0, 0) : 0), 0)

  // resumen del periodo
  const earned = totals.reduce((s, t) => s + (isRent(t.barber_id) ? 0 : t.barber_share + t.barber_tip), 0)
  const rentDue = totals.reduce((s, t) => {
    const sc = schemes.get(t.barber_id)
    return s + (sc?.model === 'rent' ? rentLine(per, sc.rentAmount, sc.rentPeriod) : 0)
  }, 0)
  const sales = totals.reduce((s, t) => s + t.sales + t.tips, 0)
  const shopKeeps = totals.reduce((s, t) => s + t.shop_share, 0) + rentDue

  return (
    <main>
      <Top title="Pagos" sub="Comisiones y lo que se le debe a cada manicurista" />
      <Flash ok={sp.ok as string} err={sp.err as string} />

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi hero">
          <small>Por pagar hoy a las manicuristas</small>
          <b>{fmtMoney(owedNow)}</b>
          <span className="ksub">Lo que han ganado menos lo que ya se les pagó</span>
          {rentNow > 0 && <span className="ksub">Arriendos por cobrar: {fmtMoney(rentNow)}</span>}
        </div>
      </div>

      <div className="eyebrow">Manicuristas</div>
      <div className="card list" style={{ paddingBlock: 4 }}>
        {totals.map((t) => {
          const sc = schemes.get(t.barber_id) ?? null
          const sum = schemeSummary(sc, shop)
          const l = led.get(t.barber_id)
          const due = sc?.model === 'rent' ? (l?.rentOwed ?? 0) : (l?.owed ?? 0)
          return (
            <Link key={t.barber_id} href={`/app/comisiones/${t.barber_id}`} className="li">
              <Avatar name={t.name} sm />
              <div className="grow">
                <div className="t">{t.name}</div>
                <div className="small muted">
                  {t.branch ?? 'Sin sede'} · {l?.last ? `último pago ${fmtDayShort(l.last.paid_on)}` : 'sin pagos aún'}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className={`pill ${sum.kind}`}>{sum.main}</span>
                  {sum.extra && <span className="pill dim">{sum.extra}</span>}
                </div>
              </div>
              <div className="right">
                {due > 0 ? (
                  <>
                    <div className="small muted">{sc?.model === 'rent' ? 'Debe arriendo' : 'Por pagar'}</div>
                    <b className="num">{fmtMoney(due)}</b>
                  </>
                ) : due < 0 && sc?.model !== 'rent' ? (
                  <>
                    <div className="small muted">Adelantado</div>
                    <b className="num">{fmtMoney(-due)}</b>
                  </>
                ) : (
                  <span className="pill ok">Al día</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
      <p className="small muted" style={{ margin: '8px 2px 0' }}>
        Toca una manicurista para registrar un pago o un adelanto, ver sus movimientos o cambiar su esquema.
      </p>

      <div className="eyebrow">Resumen por periodo</div>
      <PeriodTabs keys={['semana', 'semana-pasada', 'mes', 'mes-pasado']} current={key} base="/app/comisiones" />
      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi">
          <small>Ventas cobradas</small>
          <b>{fmtMoney(sales)}</b>
        </div>
        <div className="kpi">
          <small>Ganaron las manicuristas</small>
          <b>{fmtMoney(earned)}</b>
          <span className="ksub">comisiones + propinas</span>
        </div>
        <div className="kpi" style={{ gridColumn: '1 / -1' }}>
          <small>Queda para el spa · {per.label}</small>
          <b>{fmtMoney(shopKeeps)}</b>
          {rentDue > 0 && <span className="ksub">incluye arriendos {fmtMoney(rentDue)}</span>}
        </div>
      </div>
      <details className="tbl">
        <summary>Ver por manicurista</summary>
        <table>
          <thead>
            <tr>
              <th>Manicurista</th>
              <th>Ventas</th>
              <th>Para la manicurista</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.barber_id}>
                <td>
                  {t.name}
                  <div className="small muted">{plural(t.services, 'servicio', 'servicios')}</div>
                </td>
                <td>{fmtMoney(t.sales)}</td>
                <td>{isRent(t.barber_id) ? 'Todo (arriendo)' : fmtMoney(t.barber_share + t.barber_tip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="eyebrow">Reglas del spa</div>
      <form action={saveShopRules} className="stack">
        <div className="rule">
          <div className="grow">
            <b>
              <label htmlFor="defaultPct">Comisión por defecto</label>
            </b>
            <div className="small muted">Para manicuristas sin esquema propio</div>
          </div>
          <span className="row" style={{ gap: 4 }}>
            <input id="defaultPct" name="defaultPct" inputMode="decimal" defaultValue={shop.defaultPct} className="mini-in" aria-label="Porcentaje por defecto" />
            <b style={{ color: 'var(--brass)' }}>%</b>
          </span>
        </div>
        <label className="rule">
          <div className="grow">
            <b>Propinas para la manicurista</b>
            <div className="small muted">Si lo apagas, quedan para el spa</div>
          </div>
          <input type="checkbox" name="tipsToBarber" defaultChecked={shop.tipsToBarber} className="sw-in" />
        </label>
        <label className="rule">
          <div className="grow">
            <b>Descontar comisión de tarjeta</b>
            <div className="small muted">El porcentaje se calcula sobre lo que queda después del datáfono</div>
          </div>
          <input type="checkbox" name="deductCardFee" defaultChecked={shop.deductCardFee} className="sw-in" />
        </label>
        <div className="rule">
          <div className="grow">
            <b>
              <label htmlFor="cardFeePct">Comisión del datáfono</label>
            </b>
            <div className="small muted">Solo aplica si activas la opción de arriba</div>
          </div>
          <span className="row" style={{ gap: 4 }}>
            <input id="cardFeePct" name="cardFeePct" inputMode="decimal" defaultValue={shop.cardFeePct} className="mini-in" aria-label="Porcentaje del datáfono" />
            <b style={{ color: 'var(--brass)' }}>%</b>
          </span>
        </div>
        <button className="btn sm">
          <Icon name="check" /> Guardar reglas
        </button>
      </form>
    </main>
  )
}
