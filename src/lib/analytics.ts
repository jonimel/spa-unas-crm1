import { rows } from './db'
import { addDaysYmd, atLocal, localParts, plural, todayYmd, weekdayOf } from './time'
import { monthAfter, monthBefore, monthName } from './periods'

/** Bloques horarios del mapa de ocupación (minutos locales). */
export const HEAT_BLOCKS = [
  { from: 9 * 60, to: 11 * 60, label: '9–11' },
  { from: 11 * 60, to: 13 * 60, label: '11–1' },
  { from: 14 * 60, to: 16 * 60, label: '2–4' },
  { from: 16 * 60, to: 18 * 60, label: '4–6' },
  { from: 18 * 60, to: 20 * 60, label: '6–8' },
]
export const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAYS_LONG = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const WEEKDAY_ONE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export type View = 'hoy' | 'semana' | 'mes'

type Appt = { barber_id: string; client_id: string; starts_at: Date; ends_at: Date; status: string }
type Pay = { amount: number; tip: number; method: string; service: string | null; barber_id: string; client_id: string; paid_at: Date }
type Hours = { barber_id: string; weekday: number; start_min: number; end_min: number }

const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
const minYmd = (a: string, b: string) => (a < b ? a : b)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const shortDay = (ymd: string) => `${Number(ymd.slice(8))} ${MONTHS_SHORT[Number(ymd.slice(5, 7)) - 1]}`

/**
 * Rango del periodo y el rango con que se compara (mismo largo, para que la comparación sea justa).
 * `cut`: el periodo va hasta hoy, así que el anterior se corta a la misma hora (hoy a las 2 p. m. contra
 * el mismo día de la semana pasada hasta las 2 p. m., no contra el día completo).
 */
export function ranges(view: View, tz: string, month: string, now = new Date()) {
  const today = todayYmd(tz, now)
  if (view === 'hoy') {
    const prev = addDaysYmd(today, -7)
    return { from: today, to: today, prevFrom: prev, prevTo: prev, cut: true, title: `Hoy · ${shortDay(today)}`, vs: `el ${WEEKDAY_ONE[weekdayOf(today)]} pasado a esta hora`, isCurrent: true }
  }
  if (view === 'semana') {
    const from = addDaysYmd(today, -((weekdayOf(today) + 6) % 7))
    const n = daysBetween(from, today)
    const prevFrom = addDaysYmd(from, -7)
    return { from, to: today, prevFrom, prevTo: addDaysYmd(prevFrom, n - 1), cut: true, title: `Semana · ${shortDay(from)} – ${shortDay(addDaysYmd(from, 6))}`, vs: 'la semana pasada a esta altura', isCurrent: true }
  }
  const lastDay = addDaysYmd(monthAfter(month), -1)
  const isCurrent = today >= month && today <= lastDay
  const to = isCurrent ? today : lastDay
  const n = daysBetween(month, to)
  const prevMonth = monthBefore(month)
  const aligned = addDaysYmd(prevMonth, n - 1)
  const prevTo = isCurrent ? minYmd(aligned, addDaysYmd(month, -1)) : addDaysYmd(month, -1)
  const pm = monthName(prevMonth).toLowerCase()
  return { from: month, to, prevFrom: prevMonth, prevTo, cut: isCurrent && prevTo === aligned, title: `${monthName(month)} ${month.slice(0, 4)}${isCurrent ? ` · ${n} días` : ''}`, vs: isCurrent ? `los mismos ${n} días de ${pm}` : pm, isCurrent }
}

export type Stats = Awaited<ReturnType<typeof statsFor>>

/** Indicadores del periodo para toda la red o una sede. */
export async function statsFor(tenantId: string, tz: string, view: View, month: string, branchId: string | null, now = new Date()) {
  const r = ranges(view, tz, month, now)
  const start = atLocal(r.from, 0, tz)
  const end = atLocal(addDaysYmd(r.to, 1), 0, tz)
  const prevStart = atLocal(r.prevFrom, 0, tz)
  const prevEnd = r.cut ? atLocal(r.prevTo, localParts(now, tz).minutes, tz) : atLocal(addDaysYmd(r.prevTo, 1), 0, tz)

  const bf = branchId ? 'and branch_id = $4' : ''
  const params = (a: Date, b: Date) => (branchId ? [tenantId, a, b, branchId] : [tenantId, a, b])

  const [pays, prevPays, appts, prevAppts, barbers, hours, firstVisits, soldLines] = await Promise.all([
    rows<Pay>(
      `select p.amount, p.tip, p.method::text method, s.name service, p.barber_id, p.client_id, p.paid_at
         from payments p left join services s on s.id = p.service_id
        where p.tenant_id = $1 and p.paid_at >= $2 and p.paid_at < $3 ${branchId ? 'and p.branch_id = $4' : ''}`,
      params(start, end),
    ),
    rows<Pay>(`select amount, tip, method::text method, null as service, barber_id, client_id, paid_at from payments where tenant_id = $1 and paid_at >= $2 and paid_at < $3 ${bf}`, params(prevStart, prevEnd)),
    rows<Appt>(`select barber_id, client_id, starts_at, ends_at, status::text status from appointments where tenant_id = $1 and starts_at >= $2 and starts_at < $3 ${bf}`, params(start, end)),
    rows<Appt>(`select barber_id, client_id, starts_at, ends_at, status::text status from appointments where tenant_id = $1 and starts_at >= $2 and starts_at < $3 ${bf}`, params(prevStart, prevEnd)),
    rows<{ id: string; name: string; active: boolean }>(`select id, name, active from users where tenant_id = $1 and (role = 'barber' or serves) order by name`, [tenantId]),
    rows<Hours>(`select barber_id, weekday, start_min, end_min from working_hours where tenant_id = $1 ${branchId ? 'and branch_id = $2' : ''}`, branchId ? [tenantId, branchId] : [tenantId]),
    rows<{ client_id: string; first: Date }>(`select client_id, min(starts_at) first from appointments where tenant_id = $1 and status = 'completed' group by client_id`, [tenantId]),
    // qué se vende: cada servicio de la cita (también los adicionales) con su parte del valor cobrado
    rows<{ service: string; amount: number }>(
      `select x.name service, coalesce(x.charged, x.price) amount
         from payments p join appointment_services x on x.appointment_id = p.appointment_id
        where p.tenant_id = $1 and p.paid_at >= $2 and p.paid_at < $3 ${branchId ? 'and p.branch_id = $4' : ''}
       union all
       select coalesce(s.name, 'Otro'), p.amount from payments p left join services s on s.id = p.service_id
        where p.tenant_id = $1 and p.paid_at >= $2 and p.paid_at < $3 ${branchId ? 'and p.branch_id = $4' : ''}
          and not exists (select 1 from appointment_services x where x.appointment_id = p.appointment_id)`,
      params(start, end),
    ),
  ])

  // ---------- ocupación (horas reservadas / horas de trabajo) ----------
  const booked = appts.filter((a) => ['completed', 'confirmed', 'no_show'].includes(a.status))
  const heatAvail = new Map<string, number>()
  const heatBooked = new Map<string, number>()
  const availByBarber = new Map<string, number>()
  const bookedByBarber = new Map<string, number>()
  for (let d = r.from; d <= r.to; d = addDaysYmd(d, 1)) {
    const wd = weekdayOf(d)
    for (const h of hours.filter((x) => x.weekday === wd)) {
      availByBarber.set(h.barber_id, (availByBarber.get(h.barber_id) ?? 0) + (h.end_min - h.start_min))
      HEAT_BLOCKS.forEach((b, i) => {
        const k = `${wd}:${i}`
        heatAvail.set(k, (heatAvail.get(k) ?? 0) + overlap(h.start_min, h.end_min, b.from, b.to))
      })
    }
  }
  for (const a of booked) {
    const { weekday, minutes } = localParts(new Date(a.starts_at), tz)
    const dur = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)
    bookedByBarber.set(a.barber_id, (bookedByBarber.get(a.barber_id) ?? 0) + dur)
    HEAT_BLOCKS.forEach((b, i) => {
      const k = `${weekday}:${i}`
      heatBooked.set(k, (heatBooked.get(k) ?? 0) + overlap(minutes, minutes + dur, b.from, b.to))
    })
  }
  // solo los días que ya pasaron en el periodo y en que alguien trabaja
  const heat = [1, 2, 3, 4, 5, 6, 0]
    .map((wd) => ({
      wd,
      label: WEEKDAYS[wd],
      cells: HEAT_BLOCKS.map((b, i) => {
        const av = heatAvail.get(`${wd}:${i}`) ?? 0
        return { block: b.label, pct: av ? Math.min(100, Math.round(((heatBooked.get(`${wd}:${i}`) ?? 0) / av) * 100)) : null }
      }),
    }))
    .filter((row) => row.cells.some((c) => c.pct !== null))
  const totalAvail = sum([...availByBarber.values()], (x) => x)
  const totalBooked = sum([...bookedByBarber.entries()].filter(([id]) => availByBarber.has(id)), ([, v]) => v)
  const occupancy = totalAvail ? Math.min(100, Math.round((totalBooked / totalAvail) * 100)) : 0

  // ---------- clientes ----------
  const firstOf = new Map(firstVisits.map((f) => [f.client_id, new Date(f.first)]))
  const clients = [...new Set(pays.map((p) => p.client_id))]
  const newClients = clients.filter((c) => {
    const f = firstOf.get(c)
    return f && f >= start && f < end
  }).length
  const returning = clients.length - newClients

  // ---------- dinero ----------
  const revenue = sum(pays, (p) => p.amount)
  const tips = sum(pays, (p) => p.tip)
  const visits = pays.length
  const prevRevenue = sum(prevPays, (p) => p.amount)
  const prevVisits = prevPays.length
  const ticket = visits ? Math.round(revenue / visits) : 0
  const prevTicket = prevVisits ? Math.round(prevRevenue / prevVisits) : 0
  const noShows = appts.filter((a) => a.status === 'no_show').length
  const attended = appts.filter((a) => a.status === 'completed').length
  const noShowPct = noShows + attended ? Math.round((noShows / (noShows + attended)) * 100) : 0
  const prevNoShows = prevAppts.filter((a) => a.status === 'no_show').length
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)

  const share = (entries: [string, number][]) => {
    const m = new Map<string, number>()
    for (const [k, v] of entries) m.set(k, (m.get(k) ?? 0) + v)
    const total = sum([...m.values()], (x) => x) || 1
    return [...m.entries()].map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value)
  }
  const services = share(soldLines.map((l) => [l.service, l.amount]))
  const methods = share(pays.map((p) => [p.method, p.amount + p.tip]))

  const byBarber = barbers
    .map((b) => {
      const mine = pays.filter((p) => p.barber_id === b.id)
      const rev = sum(mine, (p) => p.amount)
      const av = availByBarber.get(b.id) ?? 0
      return {
        id: b.id,
        name: b.name,
        revenue: rev,
        visits: mine.length,
        ticket: mine.length ? Math.round(rev / mine.length) : 0,
        occupancy: av ? Math.min(100, Math.round(((bookedByBarber.get(b.id) ?? 0) / av) * 100)) : null,
        show: (b.active && (!branchId || av > 0)) || mine.length > 0,
      }
    })
    .filter((b) => b.show)
    .sort((a, b) => b.revenue - a.revenue)

  // ---------- series para gráficas ----------
  // por día de la semana actual (vistas hoy/semana) y por mes (vista mes)
  const today = todayYmd(tz, now)
  const weekFrom = addDaysYmd(today, -((weekdayOf(today) + 6) % 7))
  const anchorMonth = view === 'mes' ? month : today.slice(0, 8) + '01'
  const sixFrom = monthBefore(monthBefore(monthBefore(monthBefore(monthBefore(anchorMonth)))))
  const [daily, monthly] = await Promise.all([
    rows<{ d: string; total: number }>(
      `select to_char(paid_at at time zone $4, 'YYYY-MM-DD') d, sum(amount)::int total from payments
        where tenant_id = $1 and paid_at >= $2 and paid_at < $3 ${branchId ? 'and branch_id = $5' : ''} group by 1`,
      branchId ? [tenantId, atLocal(weekFrom, 0, tz), atLocal(addDaysYmd(weekFrom, 7), 0, tz), tz, branchId] : [tenantId, atLocal(weekFrom, 0, tz), atLocal(addDaysYmd(weekFrom, 7), 0, tz), tz],
    ),
    rows<{ ym: string; total: number }>(
      `select to_char(paid_at at time zone $4, 'YYYY-MM') ym, sum(amount)::int total from payments
        where tenant_id = $1 and paid_at >= $2 and paid_at < $3 ${branchId ? 'and branch_id = $5' : ''} group by 1`,
      branchId ? [tenantId, atLocal(sixFrom, 0, tz), atLocal(monthAfter(anchorMonth), 0, tz), tz, branchId] : [tenantId, atLocal(sixFrom, 0, tz), atLocal(monthAfter(anchorMonth), 0, tz), tz],
    ),
  ])
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysYmd(weekFrom, i)
    return { key: d, label: WEEKDAYS[weekdayOf(d)], total: daily.find((x) => x.d === d)?.total ?? 0, current: d === today, future: d > today }
  })
  const months: { key: string; label: string; total: number; current: boolean; future: boolean }[] = []
  for (let m = sixFrom, i = 0; i < 6; m = monthAfter(m), i++)
    months.push({ key: m.slice(0, 7), label: monthName(m, false), total: monthly.find((x) => x.ym === m.slice(0, 7))?.total ?? 0, current: m === anchorMonth, future: false })
  // un spa que empezó hace poco no ve meses vacíos antes de empezar
  while (months.length > 2 && months[0].total === 0) months.shift()

  // ---------- lo que vemos (hallazgos en lenguaje simple) ----------
  const insights: { text: string; tone: 'ok' | 'warn' | 'brass' }[] = []
  const dRev = pct(revenue, prevRevenue)
  if (dRev !== null && visits > 0)
    insights.push({
      tone: dRev >= 0 ? 'ok' : 'warn',
      text: r.isCurrent
        ? `Los ingresos van ${dRev >= 0 ? `${dRev}% arriba` : `${Math.abs(dRev)}% abajo`} frente a ${r.vs}: ${plural(visits, 'visita', 'visitas')}, antes ${prevVisits}.`
        : `Los ingresos ${dRev >= 0 ? `subieron ${dRev}%` : `bajaron ${Math.abs(dRev)}%`} frente a ${r.vs}: ${plural(visits, 'visita', 'visitas')}, antes ${prevVisits}.`,
    })
  const cells = heat.flatMap((row) => row.cells.map((c) => ({ ...c, wd: row.wd }))).filter((c) => c.pct !== null) as { block: string; pct: number; wd: number }[]
  if (view !== 'hoy' && cells.length) {
    const hi = cells.reduce((a, b) => (b.pct > a.pct ? b : a))
    // hoy todavía no termina: no se marca como horario flojo en la vista de la semana
    const loCells = view === 'semana' ? cells.filter((c) => c.wd !== weekdayOf(today)) : cells
    const lo = loCells.length ? loCells.reduce((a, b) => (b.pct < a.pct ? b : a)) : null
    const promo = 'buen horario para una promoción por WhatsApp.'
    if (view === 'semana') {
      // una sola semana: se habla de ese día, no de "los martes"
      if (hi.pct >= 65) insights.push({ tone: 'brass', text: `El ${WEEKDAY_ONE[hi.wd]} de ${hi.block} se llenó al ${hi.pct}%: fue el horario más pedido de la semana.` })
      if (lo && lo.pct <= 40 && lo !== hi) insights.push({ tone: 'warn', text: `El ${WEEKDAY_ONE[lo.wd]} de ${lo.block} solo se llenó al ${lo.pct}%: ${promo}` })
    } else if (r.isCurrent) {
      if (hi.pct >= 65) insights.push({ tone: 'brass', text: `Los ${WEEKDAYS_LONG[hi.wd]} de ${hi.block} están al ${hi.pct}%: es el horario más pedido. Vale la pena tener a todo el equipo ese turno.` })
      if (lo && lo.pct <= 40 && lo !== hi) insights.push({ tone: 'warn', text: `Los ${WEEKDAYS_LONG[lo.wd]} de ${lo.block} solo se llenan al ${lo.pct}%: ${promo}` })
    } else {
      if (hi.pct >= 65) insights.push({ tone: 'brass', text: `Los ${WEEKDAYS_LONG[hi.wd]} de ${hi.block} estuvieron al ${hi.pct}%: fue el horario más pedido del mes.` })
      if (lo && lo.pct <= 40 && lo !== hi) insights.push({ tone: 'warn', text: `Los ${WEEKDAYS_LONG[lo.wd]} de ${lo.block} solo se llenaron al ${lo.pct}%: ${promo}` })
    }
  }
  if (noShows > 0)
    insights.push({
      tone: noShowPct >= 8 ? 'warn' : 'ok',
      text: `${noShows} ${noShows === 1 ? 'cita no llegó' : 'citas no llegaron'} (${noShowPct}%)${prevNoShows ? `; en el periodo anterior fueron ${prevNoShows}` : ''}. El recordatorio por WhatsApp 2 horas antes ayuda a que sean menos.`,
    })
  if (clients.length)
    insights.push({ tone: 'ok', text: `${Math.round((returning / clients.length) * 100)}% de las clientas ya habían venido antes; ${newClients} ${newClients === 1 ? 'es nueva' : 'son nuevas'}.` })

  return {
    view,
    ...r,
    revenue,
    tips,
    visits,
    ticket,
    deltaRevenue: dRev,
    deltaVisits: pct(visits, prevVisits),
    deltaTicket: pct(ticket, prevTicket),
    newClients,
    returningPct: clients.length ? Math.round((returning / clients.length) * 100) : 0,
    noShows,
    noShowPct,
    occupancy,
    heat,
    services,
    methods,
    byBarber,
    week,
    months,
    insights: insights.slice(0, 4),
  }
}
