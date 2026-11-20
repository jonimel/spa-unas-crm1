import type { PGlite, Transaction } from '@electric-sql/pglite'
import { one, rows, type Queryable } from './db'
import { computeShare, RENT_RULE, rentPeriodsStarted, type PayoutKind, type Rate, type Scheme, type ShopRules } from './commission'

export async function shopRules(tenantId: string, on?: Queryable): Promise<ShopRules> {
  const t = await one<{ default_commission_pct: string; tips_to_barber: boolean; deduct_card_fee: boolean; card_fee_pct: string }>(
    'select default_commission_pct, tips_to_barber, deduct_card_fee, card_fee_pct from tenants where id = $1',
    [tenantId],
    on,
  )
  return {
    defaultPct: Number(t?.default_commission_pct ?? 45),
    tipsToBarber: t?.tips_to_barber ?? true,
    deductCardFee: t?.deduct_card_fee ?? false,
    cardFeePct: Number(t?.card_fee_pct ?? 3),
  }
}

export async function schemesFor(tenantId: string, on?: Queryable): Promise<Map<string, Scheme>> {
  const pays = await rows<{ barber_id: string; model: Scheme['model']; percent: string | null; rent_amount: number | null; rent_period: Scheme['rentPeriod']; rent_since: string | null }>(
    `select barber_id, model, percent, rent_amount, rent_period, to_char(rent_since, 'YYYY-MM-DD') rent_since from barber_pay where tenant_id = $1`,
    [tenantId],
    on,
  )
  const rates = await rows<{ barber_id: string; service_id: string; kind: Rate['kind']; value: string }>(
    'select barber_id, service_id, kind, value from barber_service_rates where tenant_id = $1',
    [tenantId],
    on,
  )
  const m = new Map<string, Scheme>()
  const get = (id: string) => {
    if (!m.has(id)) m.set(id, { model: 'percent', percent: null, rentAmount: null, rentPeriod: null, rates: {} })
    return m.get(id)!
  }
  for (const p of pays) Object.assign(get(p.barber_id), { model: p.model, percent: p.percent === null ? null : Number(p.percent), rentAmount: p.rent_amount, rentPeriod: p.rent_period, rentSince: p.rent_since })
  for (const r of rates) get(r.barber_id).rates[r.service_id] = { kind: r.kind, value: Number(r.value) }
  return m
}

export const OWNER_RULE = 'Dueña: todo para el spa'

function ownerShare(s: ReturnType<typeof computeShare>): ReturnType<typeof computeShare> {
  return { ...s, barberShare: 0, barberTip: 0, rule: OWNER_RULE, lines: s.lines.map((l) => ({ ...l, barberShare: 0, rule: OWNER_RULE })) }
}

/** Calcula y guarda la repartición de los pagos que aún no la tienen (pagos nuevos o de antes de la fase 2), línea por línea. */
export async function settlePending(on: PGlite | Transaction, tenantId?: string) {
  const pending = await rows<{ id: string; appointment_id: string | null; tenant_id: string; barber_id: string; service_id: string | null; amount: number; tip: number; method: string }>(
    `select id, appointment_id, tenant_id, barber_id, service_id, amount, tip, method::text from payments where barber_share is null ${tenantId ? 'and tenant_id = $1' : ''}`,
    tenantId ? [tenantId] : [],
    on,
  )
  if (!pending.length) return 0
  const lineRows = await rows<{ id: string; appointment_id: string; service_id: string | null; price: number }>(
    `select id, appointment_id, service_id, price from appointment_services where appointment_id = any($1) order by appointment_id, sort`,
    [pending.map((p) => p.appointment_id).filter(Boolean)],
    on,
  )
  const byAppt = new Map<string, typeof lineRows>()
  for (const l of lineRows) byAppt.set(l.appointment_id, [...(byAppt.get(l.appointment_id) ?? []), l])
  const cache = new Map<string, { shop: ShopRules; schemes: Map<string, Scheme>; owners: Set<string> }>()
  const done: unknown[][] = []
  const lineDone: unknown[][] = []
  for (const p of pending) {
    if (!cache.has(p.tenant_id))
      cache.set(p.tenant_id, {
        shop: await shopRules(p.tenant_id, on),
        schemes: await schemesFor(p.tenant_id, on),
        owners: new Set((await rows<{ id: string }>(`select id from users where tenant_id = $1 and role = 'owner'`, [p.tenant_id], on)).map((u) => u.id)),
      })
    const c = cache.get(p.tenant_id)!
    const lines = (p.appointment_id && byAppt.get(p.appointment_id)) || []
    const input = { amount: p.amount, tip: p.tip, method: p.method, serviceId: p.service_id, lines: lines.map((l) => ({ serviceId: l.service_id, price: l.price })) }
    // la dueña que también atiende: lo que cobra (servicio y propina) es todo del spa
    const s = c.owners.has(p.barber_id)
      ? ownerShare(computeShare(input, { model: 'percent', percent: 0, rentAmount: null, rentPeriod: null, rates: {} }, { ...c.shop, tipsToBarber: false, deductCardFee: false }))
      : computeShare(input, c.schemes.get(p.barber_id) ?? null, c.shop)
    done.push([p.id, s.barberShare, s.barberTip, s.shopShare, s.rule])
    lines.forEach((l, i) => lineDone.push([l.id, s.lines[i].charged, s.lines[i].barberShare, s.lines[i].rule]))
  }
  // en bloques, para que miles de pagos de antes se repartan en un momento
  const bulk = async (data: unknown[][], sql: (values: string) => string) => {
    for (let i = 0; i < data.length; i += 500) {
      const params: unknown[] = []
      const values = data
        .slice(i, i + 500)
        .map((row) => `(${row.map((v) => `$${params.push(v)}`).join(',')})`)
        .join(',')
      await on.query(sql(values), params)
    }
  }
  await bulk(
    done,
    (values) => `update payments p set barber_share = v.bs::int, barber_tip = v.bt::int, shop_share = v.ss::int, rule = v.rule
         from (values ${values}) as v(id, bs, bt, ss, rule) where p.id = v.id::uuid`,
  )
  await bulk(
    lineDone,
    (values) => `update appointment_services x set charged = v.ch::int, barber_share = v.bs::int, rule = v.rule
         from (values ${values}) as v(id, ch, bs, rule) where x.id = v.id::uuid`,
  )
  return pending.length
}

// ---------------- cuenta de cada manicurista (pagos) ----------------

export type Ledger = {
  earned: number // comisiones + propinas cobradas desde que empezó la cuenta (sin lo de arriendo de puesto, que ya es suyo)
  paid: number // pagos + adelantos registrados
  owed: number // earned - paid: lo que el spa le debe hoy (negativo = se le adelantó de más)
  rentDue: number // arriendos de los periodos ya empezados
  rentPaid: number
  rentOwed: number // lo que la manicurista debe de arriendo
  last: { paid_on: string; amount: number; kind: PayoutKind } | null
}

/** Saldo de cada manicurista a hoy (`today` = fecha local YYYY-MM-DD). */
export async function ledgers(tenantId: string, today: string, barberId?: string): Promise<Map<string, Ledger>> {
  const bf = barberId ? 'and barber_id = $2' : ''
  const base = barberId ? [tenantId, barberId] : [tenantId]
  const [barbers, earned, paid, last, schemes] = await Promise.all([
    rows<{ id: string }>(`select id from users where tenant_id = $1 and role = 'barber' ${barberId ? 'and id = $2' : ''}`, base),
    rows<{ barber_id: string; earned: number }>(
      `select barber_id, coalesce(sum(barber_share + barber_tip) filter (where rule is distinct from $${base.length + 1}), 0)::int earned
         from payments where tenant_id = $1 ${bf} and paid_at >= (select ledger_start from tenants where id = $1) group by barber_id`,
      [...base, RENT_RULE],
    ),
    rows<{ barber_id: string; kind: PayoutKind; total: number }>(
      `select barber_id, kind::text kind, sum(amount)::int total from barber_payouts where tenant_id = $1 ${bf} and voided_at is null group by 1, 2`,
      base,
    ),
    rows<{ barber_id: string; paid_on: string; amount: number; kind: PayoutKind }>(
      `select distinct on (barber_id) barber_id, to_char(paid_on, 'YYYY-MM-DD') paid_on, amount, kind::text kind
         from barber_payouts where tenant_id = $1 ${bf} and voided_at is null order by barber_id, paid_on desc, created_at desc`,
      base,
    ),
    schemesFor(tenantId),
  ])
  const m = new Map<string, Ledger>()
  for (const b of barbers) {
    const sum = (k: PayoutKind) => paid.find((p) => p.barber_id === b.id && p.kind === k)?.total ?? 0
    const e = earned.find((x) => x.barber_id === b.id)?.earned ?? 0
    const p = sum('pago') + sum('adelanto')
    const sc = schemes.get(b.id)
    const rentDue =
      sc?.model === 'rent' && sc.rentAmount && sc.rentPeriod && sc.rentSince ? rentPeriodsStarted(sc.rentSince, today, sc.rentPeriod) * sc.rentAmount : 0
    const rentPaid = sum('arriendo')
    m.set(b.id, { earned: e, paid: p, owed: e - p, rentDue, rentPaid, rentOwed: rentDue - rentPaid, last: last.find((l) => l.barber_id === b.id) ?? null })
  }
  return m
}

export type PayoutRow = { id: string; kind: PayoutKind; amount: number; method: string; paid_on: string; note: string | null; voided: boolean; by: string | null }

/** Movimientos de una manicurista, del más reciente al más antiguo. */
export async function payoutsFor(tenantId: string, barberId: string, limit = 30) {
  return rows<PayoutRow>(
    `select p.id, p.kind::text kind, p.amount, p.method::text method, to_char(p.paid_on, 'YYYY-MM-DD') paid_on, p.note,
            p.voided_at is not null voided, u.name by
       from barber_payouts p left join users u on u.id = p.created_by
      where p.tenant_id = $1 and p.barber_id = $2
      order by p.paid_on desc, p.created_at desc limit $3`,
    [tenantId, barberId, limit],
  )
}

// ---------------- reportes ----------------

export type BarberTotals = {
  barber_id: string
  name: string
  branch: string | null
  services: number
  sales: number // valor de los servicios cobrados
  tips: number // todas las propinas
  barber_share: number
  barber_tip: number
  shop_share: number
}

/** Totales por manicurista en un rango (pagos cobrados). Incluye manicuristas activas sin ventas. */
export async function totalsByBarber(tenantId: string, start: Date, end: Date, opts: { barberId?: string; branchId?: string } = {}) {
  const params: unknown[] = [tenantId, start, end]
  let extra = ''
  if (opts.barberId) {
    params.push(opts.barberId)
    extra += ` and u.id = $${params.length}`
  }
  if (opts.branchId) {
    params.push(opts.branchId)
    extra += ` and u.branch_id = $${params.length}`
  }
  return rows<BarberTotals>(
    `select u.id barber_id, u.name, b.name branch,
            count(p.id)::int services,
            coalesce(sum(p.amount), 0)::int sales,
            coalesce(sum(p.tip), 0)::int tips,
            coalesce(sum(p.barber_share), 0)::int barber_share,
            coalesce(sum(p.barber_tip), 0)::int barber_tip,
            coalesce(sum(p.shop_share), 0)::int shop_share
       from users u
       left join branches b on b.id = u.branch_id
       left join payments p on p.barber_id = u.id and p.paid_at >= $2 and p.paid_at < $3
      where u.tenant_id = $1 and u.role = 'barber' and (u.active or p.id is not null) ${extra}
      group by u.id, u.name, b.name
      order by sales desc, u.name`,
    params,
  )
}

export type ServiceLine = { service: string; n: number; sales: number; share: number; rules: string[] }

/** Desglose por servicio para una manicurista (lo que ve en "Mis pagos"): cada servicio de la cita cuenta en su línea. */
export async function breakdownByService(barberId: string, start: Date, end: Date): Promise<ServiceLine[]> {
  const r = await rows<{ service: string | null; n: number; sales: number; share: number; rules: string[] }>(
    `with l as (
       select x.name service, coalesce(x.charged, 0) sales, coalesce(x.barber_share, 0) share, x.rule
         from payments p join appointment_services x on x.appointment_id = p.appointment_id
        where p.barber_id = $1 and p.paid_at >= $2 and p.paid_at < $3
       union all
       select s.name, p.amount, coalesce(p.barber_share, 0), p.rule
         from payments p left join services s on s.id = p.service_id
        where p.barber_id = $1 and p.paid_at >= $2 and p.paid_at < $3
          and not exists (select 1 from appointment_services x where x.appointment_id = p.appointment_id)
     )
     select service, count(*)::int n, sum(sales)::int sales, sum(share)::int share, array_agg(distinct rule) rules
       from l group by service order by sum(share) desc`,
    [barberId, start, end],
  )
  return r.map((x) => ({ ...x, service: x.service ?? 'Otro', rules: x.rules.filter(Boolean) }))
}
