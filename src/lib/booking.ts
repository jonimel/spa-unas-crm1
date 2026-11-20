import { one, rows, tx, type Queryable } from './db'
import { computeSlots, type BarberDay, type Slot } from './availability'
import { addDaysYmd, atLocal, fmtDay, fmtTime, localParts, todayYmd, weekdayOf } from './time'
import { firstName, normalizeCoPhone } from './phone'
import { sendWhatsApp } from './whatsapp'

export type Tenant = {
  id: string
  slug: string
  name: string
  city: string | null
  timezone: string
  min_notice_min: number
  approval_window_min: number
  approval_cutoff_min: number
  reminder_before_min: number
  slot_step_min: number
  booking_days_ahead: number
}
export type Branch = { id: string; name: string; address: string | null; phone: string | null }
export type Service = { id: string; name: string; description: string | null; duration_min: number; price: number; is_addon: boolean }
export type Barber = { id: string; name: string; phone: string; branch_id: string | null }

export const ACTIVE_STATUSES = `('pending','confirmed','completed')`

export class BookingError extends Error {}

export async function tenantBySlug(slug: string, on?: Queryable) {
  return one<Tenant>('select * from tenants where slug = $1', [slug], on)
}
export async function tenantById(id: string, on?: Queryable) {
  return one<Tenant>('select * from tenants where id = $1', [id], on)
}

export async function bookingCatalog(tenantId: string) {
  const [branches, services] = await Promise.all([
    rows<Branch>('select id, name, address, phone from branches where tenant_id = $1 and active order by sort, name', [tenantId]),
    rows<Service>('select id, name, description, duration_min, price, is_addon from services where tenant_id = $1 and active order by is_addon, sort, name', [tenantId]),
  ])
  return { branches, services }
}

/** Manicuristas que trabajan en una sede (tienen horario allí). */
export async function barbersOfBranch(tenantId: string, branchId: string, on?: Queryable) {
  return rows<Barber>(
    `select distinct u.id, u.name, u.phone, u.branch_id
       from users u join working_hours w on w.barber_id = u.id
      where u.tenant_id = $1 and w.branch_id = $2 and u.active and u.role = 'barber'
      order by u.name`,
    [tenantId, branchId],
    on,
  )
}

async function barberDays(t: Tenant, branchId: string, ymd: string, onlyBarber: string | null, on?: Queryable): Promise<BarberDay[]> {
  const wd = weekdayOf(ymd)
  const hours = await rows<{ barber_id: string; start_min: number; end_min: number }>(
    `select w.barber_id, w.start_min, w.end_min
       from working_hours w join users u on u.id = w.barber_id and u.active and u.role = 'barber'
      where w.tenant_id = $1 and w.branch_id = $2 and w.weekday = $3 ${onlyBarber ? 'and w.barber_id = $4' : ''}
      order by w.start_min`,
    onlyBarber ? [t.id, branchId, wd, onlyBarber] : [t.id, branchId, wd],
    on,
  )
  const ids = [...new Set(hours.map((h) => h.barber_id))]
  if (!ids.length) return []
  const dayStart = atLocal(ymd, 0, t.timezone)
  const dayEnd = atLocal(addDaysYmd(ymd, 1), 0, t.timezone)
  const busy = await rows<{ barber_id: string; start: Date; end: Date }>(
    `select barber_id, starts_at as start, ends_at as "end" from appointments
      where barber_id = any($1) and status in ${ACTIVE_STATUSES} and starts_at < $3 and ends_at > $2
     union all
     select barber_id, starts_at, ends_at from time_off
      where barber_id = any($1) and starts_at < $3 and ends_at > $2`,
    [ids, dayStart, dayEnd],
    on,
  )
  return ids.map((id) => ({
    id,
    hours: hours.filter((h) => h.barber_id === id),
    busy: busy.filter((b) => b.barber_id === id).map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
  }))
}

export async function slotsFor(
  t: Tenant,
  opts: { branchId: string; durationMin: number; ymd: string; barberId?: string | null; now?: Date; minNoticeMin?: number },
  on?: Queryable,
): Promise<Slot[]> {
  const barbers = await barberDays(t, opts.branchId, opts.ymd, opts.barberId ?? null, on)
  return computeSlots({
    ymd: opts.ymd,
    tz: t.timezone,
    durationMin: opts.durationMin,
    stepMin: t.slot_step_min,
    now: opts.now ?? new Date(),
    minNoticeMin: opts.minNoticeMin ?? t.min_notice_min,
    barbers,
  })
}

/** Resumen de los próximos días para la tira de fechas: cuántas horas libres hay en cada uno. */
export async function daysOverview(t: Tenant, branchId: string, durationMin: number) {
  const start = todayYmd(t.timezone)
  const out: { ymd: string; free: number }[] = []
  for (let i = 0; i < t.booking_days_ahead; i++) {
    const ymd = addDaysYmd(start, i)
    const s = await slotsFor(t, { branchId, durationMin, ymd })
    out.push({ ymd, free: s.length })
  }
  return out
}

export function approvalDeadline(t: Tenant, createdAt: Date, startsAt: Date) {
  const a = createdAt.getTime() + t.approval_window_min * 60_000
  const b = startsAt.getTime() - t.approval_cutoff_min * 60_000
  return new Date(Math.max(createdAt.getTime(), Math.min(a, b)))
}

async function upsertClient(tenantId: string, name: string, phone: string | null, on: Queryable) {
  if (phone) {
    const found = await one<{ id: string }>('select id from clients where tenant_id = $1 and phone = $2', [tenantId, phone], on)
    if (found) return found.id
  }
  const c = await one<{ id: string }>('insert into clients (tenant_id, name, phone) values ($1, $2, $3) returning id', [tenantId, name, phone], on)
  return c!.id
}

/** Elige la manicurista con menos citas ese día (reparto parejo cuando la clienta dice "cualquiera"). */
async function pickBarber(candidates: string[], t: Tenant, ymd: string, on: Queryable) {
  if (candidates.length === 1) return candidates[0]
  const dayStart = atLocal(ymd, 0, t.timezone)
  const dayEnd = atLocal(addDaysYmd(ymd, 1), 0, t.timezone)
  const counts = await rows<{ barber_id: string; n: number }>(
    `select barber_id, count(*)::int n from appointments
      where barber_id = any($1) and status in ${ACTIVE_STATUSES} and starts_at >= $2 and starts_at < $3 group by barber_id`,
    [candidates, dayStart, dayEnd],
    on,
  )
  const n = (id: string) => counts.find((c) => c.barber_id === id)?.n ?? 0
  return [...candidates].sort((a, b) => n(a) - n(b))[0]
}

export type NewBooking = {
  tenantId: string
  branchId: string
  /** uno o más servicios (los adicionales van con al menos un servicio principal) */
  serviceIds?: string[]
  /** atajo para un solo servicio */
  serviceId?: string
  start: Date
  barberId: string | null
  clientName: string
  clientPhone: string | null
  note?: string | null
  source: 'online' | 'walkin' | 'staff'
  createdBy?: string | null
}

/** Servicios elegidos, validados: sin repetir, al menos uno principal; primero los principales y luego los adicionales. */
export async function loadServices(tenantId: string, ids: string[], on?: Queryable): Promise<Service[]> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) throw new BookingError('Elige al menos un servicio')
  if (uniq.length > 8) throw new BookingError('Son demasiados servicios para una sola cita')
  if (!uniq.every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new BookingError('Servicio no disponible')
  const found = await rows<Service>(
    'select id, name, description, duration_min, price, is_addon from services where tenant_id = $1 and active and id = any($2)',
    [tenantId, uniq],
    on,
  )
  if (found.length !== uniq.length) throw new BookingError('Servicio no disponible')
  const ordered = uniq.map((id) => found.find((f) => f.id === id)!)
  const mains = ordered.filter((x) => !x.is_addon)
  if (!mains.length) throw new BookingError('Elige al menos un servicio principal (los adicionales van con otro servicio)')
  return [...mains, ...ordered.filter((x) => x.is_addon)]
}

/** Duración y precio de una cita con varios servicios: la suma. */
export const comboTotals = (svcs: Pick<Service, 'duration_min' | 'price'>[]) => ({
  duration: svcs.reduce((a, x) => a + x.duration_min, 0),
  price: svcs.reduce((a, x) => a + x.price, 0),
})

export const comboName = (svcs: Pick<Service, 'name'>[]) => svcs.map((x) => x.name).join(' + ')

/** Crea una cita validando de nuevo la disponibilidad dentro de la transacción (evita doble reserva). */
export async function createAppointment(b: NewBooking) {
  const id = await tx(async (on) => {
    const t = await tenantById(b.tenantId, on)
    if (!t) throw new BookingError('Spa no encontrado')
    const svcs = await loadServices(t.id, b.serviceIds ?? (b.serviceId ? [b.serviceId] : []), on)
    const { duration, price } = comboTotals(svcs)
    const branch = await one<Branch>('select id, name, address, phone from branches where id = $1 and tenant_id = $2 and active', [b.branchId, t.id], on)
    if (!branch) throw new BookingError('Sede no disponible')

    const { ymd, minutes } = localParts(b.start, t.timezone)
    const online = b.source === 'online'
    const slots = await slotsFor(
      t,
      { branchId: branch.id, durationMin: duration, ymd, barberId: b.barberId, minNoticeMin: online ? t.min_notice_min : -24 * 60 },
      on,
    )
    const slot = online ? slots.find((s) => s.minutes === minutes) : undefined
    let candidates: string[]
    if (online) {
      if (!slot) throw new BookingError('Esa hora ya no está disponible. Elige otra.')
      candidates = slot.barberIds
    } else {
      // en el spa (clienta de paso / la manicurista agenda): cualquier minuto, solo sin cruces
      if (!b.barberId) throw new BookingError('Elige la manicurista')
      const barber = await one('select 1 from users where id = $1 and tenant_id = $2 and role = $3 and active', [b.barberId, t.id, 'barber'], on)
      if (!barber) throw new BookingError('Manicurista no disponible')
      const end = new Date(b.start.getTime() + duration * 60_000)
      const clash = await one<{ starts_at: Date; ends_at: Date }>(
        `select starts_at, ends_at from appointments where barber_id = $1 and status in ${ACTIVE_STATUSES} and starts_at < $3 and ends_at > $2 order by starts_at limit 1`,
        [b.barberId, b.start, end],
        on,
      )
      if (clash)
        throw new BookingError(
          `La manicurista ya tiene una cita de ${fmtTime(new Date(clash.starts_at), t.timezone)} a ${fmtTime(new Date(clash.ends_at), t.timezone)}: elige otra hora, otra manicurista o menos servicios.`,
        )
      candidates = [b.barberId]
    }
    const barberId = await pickBarber(candidates, t, ymd, on)
    const clientId = await upsertClient(t.id, b.clientName, b.clientPhone, on)
    const now = new Date()
    const end = new Date(b.start.getTime() + duration * 60_000)
    const status = online ? 'pending' : 'confirmed'
    const row = await one<{ id: string }>(
      `insert into appointments (tenant_id, branch_id, barber_id, client_id, service_id, starts_at, ends_at, status, source,
                                 price, client_note, approval_deadline, decided_at, decided_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [
        t.id, branch.id, barberId, clientId, svcs[0].id, b.start, end, status, b.source, price, b.note ?? null,
        online ? approvalDeadline(t, now, b.start) : null,
        online ? null : now,
        online ? null : (b.createdBy ?? null),
      ],
      on,
    )
    await insertLines(t.id, row!.id, svcs, on)
    return row!.id
  })

  if (b.source === 'online') {
    const v = await apptView(id)
    if (v) {
      if (v.client_phone)
        await sendWhatsApp({
          tenantId: v.tenant_id, toPhone: v.client_phone, template: 'solicitud_recibida', appointmentId: id,
          vars: { nombre: firstName(v.client_name), spa: v.tenant_name, servicio: v.service_name, fecha: v.day, hora: v.time, manicurista: v.barber_name },
        })
      await sendWhatsApp({
        tenantId: v.tenant_id, toPhone: v.barber_phone, template: 'manicurista_nueva_solicitud', appointmentId: id,
        vars: { manicurista: firstName(v.barber_name), cliente: v.client_name, servicio: v.service_name, fecha: v.day, hora: v.time, limite: v.deadline_time ?? '' },
      })
    }
  }
  return id
}

/** Guarda las líneas (servicios) de una cita. */
export async function insertLines(tenantId: string, appointmentId: string, svcs: Service[], on: Queryable) {
  const params: unknown[] = []
  const values = svcs
    .map((x, i) => `(${[tenantId, appointmentId, x.id, x.name, x.duration_min, x.price, x.is_addon, i].map((v) => `$${params.push(v)}`).join(',')})`)
    .join(',')
  await on.query(
    `insert into appointment_services (tenant_id, appointment_id, service_id, name, duration_min, price, is_addon, sort) values ${values}`,
    params,
  )
}

export type ApptLine = { service_id: string | null; name: string; duration_min: number; price: number; is_addon: boolean; charged: number | null }

export type ApptView = {
  id: string
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  timezone: string
  branch_id: string
  branch_name: string
  branch_address: string | null
  barber_id: string
  barber_name: string
  barber_phone: string
  client_id: string
  client_name: string
  client_phone: string | null
  client_allergies: string | null
  client_colors: string | null
  service_id: string
  /** todos los servicios de la cita, unidos con " + " */
  service_name: string
  lines: ApptLine[]
  duration_min: number
  starts_at: Date
  ends_at: Date
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show'
  source: 'online' | 'walkin' | 'staff'
  price: number
  client_note: string | null
  approval_deadline: Date | null
  owner_alerted_at: Date | null
  created_at: Date
  paid_amount: number | null
  paid_tip: number | null
  paid_method: string | null
  // formateados
  day: string
  time: string
  deadline_time: string | null
}

export const APPT_SELECT = `
  select a.id, a.tenant_id, t.name tenant_name, t.slug tenant_slug, t.timezone,
         a.branch_id, br.name branch_name, br.address branch_address,
         a.barber_id, u.name barber_name, u.phone barber_phone,
         a.client_id, c.name client_name, c.phone client_phone, c.allergies client_allergies, c.favorite_colors client_colors,
         a.service_id,
         coalesce(l.names, s.name) service_name,
         coalesce(l.lines, json_build_array(json_build_object('service_id', s.id, 'name', s.name, 'duration_min', s.duration_min, 'price', a.price, 'is_addon', false, 'charged', null))) lines,
         (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int duration_min,
         a.starts_at, a.ends_at, a.status, a.source, a.price, a.client_note,
         a.approval_deadline, a.owner_alerted_at, a.created_at,
         p.amount paid_amount, p.tip paid_tip, p.method::text paid_method
    from appointments a
    join tenants t on t.id = a.tenant_id
    join branches br on br.id = a.branch_id
    join users u on u.id = a.barber_id
    join clients c on c.id = a.client_id
    join services s on s.id = a.service_id
    left join lateral (
      select string_agg(x.name, ' + ' order by x.sort) names,
             json_agg(json_build_object('service_id', x.service_id, 'name', x.name, 'duration_min', x.duration_min, 'price', x.price,
                                        'is_addon', x.is_addon, 'charged', x.charged) order by x.sort) lines
        from appointment_services x where x.appointment_id = a.id
    ) l on true
    left join payments p on p.appointment_id = a.id`

export function decorate<T extends Omit<ApptView, 'day' | 'time' | 'deadline_time'>>(r: T): T & Pick<ApptView, 'day' | 'time' | 'deadline_time'> {
  return {
    ...r,
    day: fmtDay(new Date(r.starts_at), r.timezone),
    time: fmtTime(new Date(r.starts_at), r.timezone),
    deadline_time: r.approval_deadline ? fmtTime(new Date(r.approval_deadline), r.timezone) : null,
  }
}

export async function apptView(id: string, on?: Queryable): Promise<ApptView | null> {
  const r = await one<Omit<ApptView, 'day' | 'time' | 'deadline_time'>>(`${APPT_SELECT} where a.id = $1`, [id], on)
  return r ? decorate(r) : null
}

export async function apptList(where: string, params: unknown[], order = 'a.starts_at'): Promise<ApptView[]> {
  const rs = await rows<Omit<ApptView, 'day' | 'time' | 'deadline_time'>>(`${APPT_SELECT} where ${where} order by ${order}`, params)
  return rs.map(decorate)
}

/**
 * Celular de WhatsApp del spa para que la clienta escriba: el de la sede si es un celular,
 * si no el de la dueña (los códigos cortos de prueba no sirven). null si no hay ninguno.
 */
export async function spaWhatsApp(tenantId: string, branchId?: string | null, on?: Queryable) {
  const r = await one<{ branch: string | null; owner: string | null }>(
    `select (select phone from branches where id = $2 and tenant_id = $1) branch,
            (select phone from users where tenant_id = $1 and role = 'owner' and active order by created_at limit 1) owner`,
    [tenantId, branchId ?? null],
    on,
  )
  return normalizeCoPhone(r?.branch ?? '') ?? normalizeCoPhone(r?.owner ?? '')
}

function publicBase() {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  return (process.env.PUBLIC_URL || railway || 'http://localhost:3000').replace(/\/+$/, '')
}

/** Link público para que las clientas reserven (sin nada del equipo a la vista). */
export function bookingLink(slug: string) {
  return `${publicBase()}/r/${slug}`
}

/** Link para que las manicuristas entren a su agenda (va aparte del link de clientas). */
export function staffLoginLink() {
  return `${publicBase()}/entrar/manicurista`
}

export { normalizeCoPhone }
