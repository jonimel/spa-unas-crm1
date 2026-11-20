import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { DEMO } from './seed'
import { settlePending } from './payroll'
import { addDaysYmd, atLocal, localParts, todayYmd, weekdayOf } from './time'

/**
 * La demo (JP Barbar) se mantiene viva: los datos de ejemplo se crean una sola vez, y sin esto, a los pocos días
 * la agenda de hoy y de los próximos días queda vacía. Cada vez que arranca el servidor (y cada hora):
 * - llena los días sin citas, desde el último día con datos hasta 2 semanas adelante
 *   (lo pasado queda atendido y cobrado; lo que viene, confirmado y más suelto),
 * - lo confirmado que ya pasó hace más de una hora se da por atendido y cobrado; lo pendiente que ya pasó, rechazado,
 * - registra los pagos de los lunes a los barberos (y el arriendo de Mateo) de las semanas que faltan,
 * - deja siempre un par de solicitudes online por confirmar.
 * Solo toca la barbería de ejemplo. DEMO_AUTOFILL=0 lo apaga.
 */

const AHEAD = 14
const BACK = 60 // hasta dónde mira hacia atrás buscando días vacíos
const DAY_FACTOR = [0, 0.8, 0.85, 0.95, 1, 1.25, 1.45]
const hourFactor = (m: number) => (m < 11 * 60 ? 0.9 : m < 13 * 60 ? 1 : m < 16 * 60 ? 0.75 : m < 18 * 60 ? 1.05 : 1.3)
const METHODS = ['efectivo', 'efectivo', 'efectivo', 'nequi', 'nequi', 'tarjeta', 'daviplata']
const FIRST = ['Santiago', 'Juan David', 'Sebastián', 'Felipe', 'Daniel', 'Alejandro', 'Nicolás', 'Samuel', 'Tomás', 'David', 'Martín', 'Emilio', 'Carlos', 'Jorge', 'Óscar', 'Esteban', 'Cristian', 'Diego', 'Simón', 'Jerónimo', 'Juan Pablo', 'Iván', 'Manuel']
const LAST = ['Pérez', 'Herrera', 'Castro', 'Ramírez', 'Ortiz', 'Vargas', 'Torres', 'Moreno', 'Quintero', 'Restrepo', 'Cárdenas', 'López', 'Martínez', 'García', 'Muñoz', 'Arias', 'Ospina', 'Valencia', 'Mejía', 'Londoño', 'Zapata', 'Giraldo']

async function insertMany(db: PGlite, table: string, cols: string[], data: unknown[][]) {
  for (let i = 0; i < data.length; i += 400) {
    const params: unknown[] = []
    const values = data
      .slice(i, i + 400)
      .map((row) => `(${row.map((v) => `$${params.push(v)}`).join(',')})`)
      .join(',')
    await db.query(`insert into ${table} (${cols.join(',')}) values ${values}`, params)
  }
}

export async function topUpDemo(db: PGlite, now = new Date()) {
  if (process.env.DEMO_AUTOFILL === '0') return null
  const t = (await db.query<{ id: string; timezone: string }>('select id, timezone from tenants where slug = $1', [DEMO.slug])).rows[0]
  if (!t) return null
  const tz = t.timezone
  const today = todayYmd(tz, now)
  const nowMin = localParts(now, tz).minutes
  const q = async <T,>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows

  // azar repetible por día (dos arranques el mismo día dan lo mismo)
  let seed = Number(today.replace(/-/g, '')) % 2147483647
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

  const barbers = await q<{ id: string; branch_id: string }>(
    `select u.id, u.branch_id from users u where u.tenant_id = $1 and u.role = 'barber' and u.active and u.branch_id is not null order by u.name`,
    [t.id],
  )
  const hours = await q<{ barber_id: string; weekday: number; start_min: number; end_min: number }>(
    `select barber_id, weekday, start_min, end_min from working_hours where tenant_id = $1`,
    [t.id],
  )
  const services = await q<{ id: string; duration_min: number; price: number }>(
    `select id, duration_min, price from services where tenant_id = $1 and active order by sort`,
    [t.id],
  )
  if (!barbers.length || !services.length) return null
  const owner = (await q<{ id: string }>(`select id from users where tenant_id = $1 and role = 'owner' order by created_at limit 1`, [t.id]))[0]

  // clientes de cada barbero (los que más lo visitan), para que vuelvan con el mismo
  const regular = await q<{ barber_id: string; client_id: string }>(
    `select barber_id, client_id from appointments where tenant_id = $1 and starts_at > now() - interval '90 days' group by 1, 2 having count(*) >= 2`,
    [t.id],
  )
  const byBarber = new Map(barbers.map((b) => [b.id, regular.filter((r) => r.barber_id === b.id).map((r) => r.client_id)]))
  const allClients = (await q<{ id: string }>(`select id from clients where tenant_id = $1`, [t.id])).map((c) => c.id)
  const usedPhones = new Set((await q<{ phone: string }>(`select phone from clients where tenant_id = $1 and phone is not null`, [t.id])).map((c) => c.phone))
  const newClients: unknown[][] = []
  const newClient = (created: Date) => {
    let phone: string
    do phone = pick(['300', '301', '310', '311', '313', '315', '316', '318', '320', '321', '350']) + String(Math.floor(rnd() * 1e7)).padStart(7, '0')
    while (usedPhones.has(phone))
    usedPhones.add(phone)
    const id = randomUUID()
    newClients.push([id, t.id, `${pick(FIRST)} ${pick(LAST)}`, phone, created])
    allClients.push(id)
    return id
  }

  // 1. días sin citas
  const from = addDaysYmd(today, -BACK)
  const existing = await q<{ d: string; barber_id: string; starts_at: Date; ends_at: Date }>(
    `select to_char(starts_at at time zone $2, 'YYYY-MM-DD') d, barber_id, starts_at, ends_at from appointments
      where tenant_id = $1 and starts_at >= $3 and status in ('pending', 'confirmed', 'completed')`,
    [t.id, tz, atLocal(from, 0, tz)],
  )
  // un día "tiene datos" si tiene al menos tantas citas como barberos; si tiene menos (por ejemplo una reserva suelta de alguien
  // que probó la demo), se completa sin cruzarse con lo que ya hay
  const perDay = new Map<string, number>()
  for (const e of existing) perDay.set(e.d, (perDay.get(e.d) ?? 0) + 1)
  const busy = new Set([...perDay].filter(([, n]) => n >= barbers.length).map(([d]) => d))
  const taken = (barber: string, start: Date, end: Date) =>
    existing.some((e) => e.barber_id === barber && new Date(e.starts_at) < end && new Date(e.ends_at) > start)
  // solo los vacíos después del último día con datos (no inventar en días que la dueña dejó vacíos a propósito)
  const lastBusyPast = [...perDay.keys()].filter((d) => d < today).sort().pop() ?? from
  const appts: unknown[][] = []
  const pays: unknown[][] = []
  for (let ymd = [addDaysYmd(lastBusyPast, 1), today].sort()[0]; ymd <= addDaysYmd(today, AHEAD); ymd = addDaysYmd(ymd, 1)) {
    if (busy.has(ymd)) continue
    const wd = weekdayOf(ymd)
    const ahead = ymd > today ? Math.round((Date.parse(ymd) - Date.parse(today)) / 864e5) : 0
    const before = appts.length
    // un día de trabajo queda con al menos tantas citas como barberos (si no, la próxima vez se volvería a llenar)
    for (let pass = 0; pass < 8 && appts.length - before + (perDay.get(ymd) ?? 0) < barbers.length && hours.some((x) => x.weekday === wd); pass++)
    for (const b of barbers) {
      for (const h of hours.filter((x) => x.barber_id === b.id && x.weekday === wd)) {
        for (let m = h.start_min; m + 30 <= h.end_min; m += 60) {
          const svc = rnd() < 0.45 && services[1] ? services[1] : pick(services)
          if (m + svc.duration_min > h.end_min) continue
          const future = ymd > today || (ymd === today && m + svc.duration_min > nowMin)
          let p = Math.min(0.95, 0.66 * (DAY_FACTOR[wd] ?? 1) * hourFactor(m))
          // lo que viene se va llenando: mañana casi lleno, en dos semanas poco
          if (future) p *= ymd === today ? 0.8 : Math.max(0.3, 0.75 - ahead * 0.035)
          if (rnd() > p) continue
          const start = atLocal(ymd, m, tz)
          const end = new Date(start.getTime() + svc.duration_min * 60_000)
          if (taken(b.id, start, end)) continue
          const created = new Date(Math.min(now.getTime() - 3_600_000, start.getTime() - (1 + Math.floor(rnd() * 4)) * 864e5))
          const mine = byBarber.get(b.id) ?? []
          const client = rnd() < 0.08 || !allClients.length ? newClient(created) : rnd() < 0.85 && mine.length ? pick(mine) : pick(allClients)
          let status = future ? 'confirmed' : 'completed'
          if (!future) {
            const r = rnd()
            if (r < 0.06) status = 'no_show'
            else if (r < 0.11) status = 'cancelled'
          }
          const id = randomUUID()
          appts.push([id, t.id, b.branch_id, b.id, client, svc.id, start, end, status, rnd() < 0.7 ? 'online' : 'walkin', svc.price, created, created])
          if (status === 'completed') pays.push([t.id, id, b.branch_id, b.id, client, svc.id, svc.price, rnd() < 0.35 ? pick([2000, 5000, 5000, 10000]) : 0, pick(METHODS), end])
        }
      }
    }
  }

  // 2. lo confirmado que ya pasó: atendido y cobrado (como si el barbero hubiera cobrado)
  const stale = await q<{ id: string; branch_id: string; barber_id: string; client_id: string; service_id: string; price: number; ends_at: Date }>(
    `select a.id, a.branch_id, a.barber_id, a.client_id, a.service_id, a.price, a.ends_at from appointments a
      where a.tenant_id = $1 and a.status = 'confirmed' and a.ends_at < $2::timestamptz - interval '1 hour'
        and not exists (select 1 from payments p where p.appointment_id = a.id)`,
    [t.id, now],
  )

  await db.transaction(async (tx) => {
    const tdb = tx as unknown as PGlite
    await insertMany(tdb, 'clients', ['id', 'tenant_id', 'name', 'phone', 'created_at'], newClients)
    await insertMany(tdb, 'appointments', ['id', 'tenant_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'starts_at', 'ends_at', 'status', 'source', 'price', 'created_at', 'decided_at'], appts)
    for (const a of stale) {
      await tx.query(`update appointments set status = 'completed' where id = $1`, [a.id])
      pays.push([t.id, a.id, a.branch_id, a.barber_id, a.client_id, a.service_id, a.price, rnd() < 0.35 ? pick([2000, 5000]) : 0, pick(METHODS), a.ends_at])
    }
    await insertMany(tdb, 'payments', ['tenant_id', 'appointment_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'amount', 'tip', 'method', 'paid_at'], pays)
    // pendiente que ya pasó: nadie la confirmó
    await tx.query(`update appointments set status = 'rejected', decided_at = now(), cancel_reason = 'Sin respuesta' where tenant_id = $1 and status = 'pending' and starts_at < $2`, [t.id, now])
    await settlePending(tx, t.id)
  })

  // 3. pagos de los lunes que faltan (lo de la semana anterior) y arriendo semanal
  const mondayOf = (ymd: string) => addDaysYmd(ymd, -((weekdayOf(ymd) + 6) % 7))
  const thisMonday = mondayOf(today)
  const payouts: unknown[][] = []
  for (const b of barbers) {
    const pay = (await q<{ model: string; rent_amount: number | null }>(`select model, rent_amount from barber_pay where barber_id = $1`, [b.id]))[0]
    const last = (await q<{ d: string | null }>(
      `select to_char(max(paid_on), 'YYYY-MM-DD') d from barber_payouts where barber_id = $1 and kind in ('pago', 'arriendo') and voided_at is null`,
      [b.id],
    ))[0]?.d
    if (!last) continue // sin historial de pagos: no inventar
    for (let mon = addDaysYmd(mondayOf(last), 7); mon <= thisMonday; mon = addDaysYmd(mon, 7)) {
      if (pay?.model === 'rent') {
        if (mon < thisMonday && pay.rent_amount) payouts.push([t.id, b.id, 'arriendo', pay.rent_amount, pick(['efectivo', 'nequi']), mon, 'Arriendo de la semana', owner?.id ?? null])
        continue
      }
      const wk = addDaysYmd(mon, -7)
      const earned = (await q<{ s: number }>(
        `select coalesce(sum(barber_share + barber_tip), 0)::int s from payments where barber_id = $1 and paid_at >= $2 and paid_at < $3`,
        [b.id, atLocal(wk, 0, tz), atLocal(mon, 0, tz)],
      ))[0].s
      const adv = (await q<{ s: number }>(
        `select coalesce(sum(amount), 0)::int s from barber_payouts where barber_id = $1 and kind = 'adelanto' and voided_at is null and paid_on >= $2 and paid_on < $3`,
        [b.id, wk, mon],
      ))[0].s
      if (earned - adv > 0) payouts.push([t.id, b.id, 'pago', earned - adv, pick(['efectivo', 'nequi', 'transferencia']), mon, 'Pago de la semana', owner?.id ?? null])
    }
  }
  await insertMany(db, 'barber_payouts', ['tenant_id', 'barber_id', 'kind', 'amount', 'method', 'paid_on', 'note', 'created_by'], payouts)

  // 4. siempre un par de solicitudes por confirmar
  const pending = (await q<{ n: number }>(`select count(*)::int n from appointments where tenant_id = $1 and status = 'pending' and starts_at > $2`, [t.id, now]))[0].n
  let added = 0
  for (let tries = 0; pending + added < 2 && tries < 40; tries++) {
    let ymd = addDaysYmd(today, 1 + Math.floor(rnd() * 3))
    if (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
    const b = pick(barbers)
    const h = hours.filter((x) => x.barber_id === b.id && x.weekday === weekdayOf(ymd))
    if (!h.length) continue
    const block = pick(h)
    const m = block.start_min + 30 * Math.floor(rnd() * Math.max(1, (block.end_min - block.start_min - 60) / 30))
    const svc = pick(services)
    const start = atLocal(ymd, m, tz)
    const end = new Date(start.getTime() + svc.duration_min * 60_000)
    const clash = await q(`select 1 from appointments where barber_id = $1 and status in ('pending','confirmed','completed') and starts_at < $3 and ends_at > $2`, [b.id, start, end])
    if (clash.length) continue
    const created = new Date(now.getTime() - (10 + Math.floor(rnd() * 60)) * 60_000)
    const client = pick(byBarber.get(b.id)?.length ? byBarber.get(b.id)! : allClients)
    await q(
      `insert into appointments (tenant_id, branch_id, barber_id, client_id, service_id, starts_at, ends_at, status, source, price, created_at, approval_deadline, client_note)
       values ($1,$2,$3,$4,$5,$6,$7,'pending','online',$8,$9,$10,$11)`,
      [t.id, b.branch_id, b.id, client, svc.id, start, end, svc.price, created, new Date(created.getTime() + 120 * 60_000), added === 0 ? 'Igual que la última vez' : null],
    )
    added++
  }
  return { appointments: appts.length, completed: stale.length, payouts: payouts.length, pending: added }
}
