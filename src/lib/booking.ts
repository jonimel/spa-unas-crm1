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
export type Service = { id: string; name: string; description: string | null; duration_min: number; price: number }
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
    rows<Service>('select id, name, description, duration_min, price from services where tenant_id = $1 and active order by sort, name', [tenantId]),
  ])
  return { branches, services }
}

/** Barberos que trabajan en una sede (tienen horario allí). */
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

/** Elige el barbero con menos citas ese día (reparto parejo cuando el cliente dice "cualquiera"). */
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
  serviceId: string
  start: Date
  barberId: string | null
  clientName: string
  clientPhone: string | null
  note?: string | null
  source: 'online' | 'walkin' | 'staff'
  createdBy?: string | null
}

/** Crea una cita validando de nuevo la disponibilidad dentro de la transacción (evita doble reserva). */
export async function createAppointment(b: NewBooking) {
  const id = await tx(async (on) => {
    const t = await tenantById(b.tenantId, on)
    if (!t) throw new BookingError('Barbería no encontrada')
    const svc = await one<Service>('select id, name, description, duration_min, price from services where id = $1 and tenant_id = $2 and active', [b.serviceId, t.id], on)
    if (!svc) throw new BookingError('Servicio no disponible')
    const branch = await one<Branch>('select id, name, address, phone from branches where id = $1 and tenant_id = $2 and active', [b.branchId, t.id], on)
    if (!branch) throw new BookingError('Sede no disponible')

    const { ymd, minutes } = localParts(b.start, t.timezone)
    const online = b.source === 'online'
    const slots = await slotsFor(
      t,
      { branchId: branch.id, durationMin: svc.duration_min, ymd, barberId: b.barberId, minNoticeMin: online ? t.min_notice_min : -24 * 60 },
      on,
    )
    const slot = online ? slots.find((s) => s.minutes === minutes) : undefined
    let candidates: string[]
    if (online) {
      if (!slot) throw new BookingError('Esa hora ya no está disponible. Elige otra.')
      candidates = slot.barberIds
    } else {
      // en la barbería (cliente de paso / el barbero agenda): cualquier minuto, solo sin cruces
      if (!b.barberId) throw new BookingError('Elige el barbero')
      const barber = await one('select 1 from users where id = $1 and tenant_id = $2 and role = $3 and active', [b.barberId, t.id, 'barber'], on)
      if (!barber) throw new BookingError('Barbero no disponible')
      const end = new Date(b.start.getTime() + svc.duration_min * 60_000)
      const clash = await one<{ starts_at: Date; ends_at: Date }>(
        `select starts_at, ends_at from appointments where barber_id = $1 and status in ${ACTIVE_STATUSES} and starts_at < $3 and ends_at > $2 order by starts_at limit 1`,
        [b.barberId, b.start, end],
        on,
      )
      if (clash)
        throw new BookingError(
          `El barbero ya tiene una cita de ${fmtTime(new Date(clash.starts_at), t.timezone)} a ${fmtTime(new Date(clash.ends_at), t.timezone)}: elige otra hora, otro barbero o un servicio más corto.`,
        )
      candidates = [b.barberId]
    }
    const barberId = await pickBarber(candidates, t, ymd, on)
    const clientId = await upsertClient(t.id, b.clientName, b.clientPhone, on)
    const now = new Date()
    const end = new Date(b.start.getTime() + svc.duration_min * 60_000)
    const status = online ? 'pending' : 'confirmed'
    const row = await one<{ id: string }>(
      `insert into appointments (tenant_id, branch_id, barber_id, client_id, service_id, starts_at, ends_at, status, source,
                                 price, client_note, approval_deadline, decided_at, decided_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [
        t.id, branch.id, barberId, clientId, svc.id, b.start, end, status, b.source, svc.price, b.note ?? null,
        online ? approvalDeadline(t, now, b.start) : null,
        online ? null : now,
        online ? null : (b.createdBy ?? null),
      ],
      on,
    )
    return row!.id
  })

  if (b.source === 'online') {
    const v = await apptView(id)
    if (v) {
      if (v.client_phone)
        await sendWhatsApp({
          tenantId: v.tenant_id, toPhone: v.client_phone, template: 'solicitud_recibida', appointmentId: id,
          vars: { nombre: firstName(v.client_name), barberia: v.tenant_name, servicio: v.service_name, fecha: v.day, hora: v.time, barbero: v.barber_name },
        })
      await sendWhatsApp({
        tenantId: v.tenant_id, toPhone: v.barber_phone, template: 'barbero_nueva_solicitud', appointmentId: id,
        vars: { barbero: firstName(v.barber_name), cliente: v.client_name, servicio: v.service_name, fecha: v.day, hora: v.time, limite: v.deadline_time ?? '' },
      })
    }
  }
  return id
}

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
  service_id: string
  service_name: string
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
         a.client_id, c.name client_name, c.phone client_phone,
         a.service_id, s.name service_name, s.duration_min,
         a.starts_at, a.ends_at, a.status, a.source, a.price, a.client_note,
         a.approval_deadline, a.owner_alerted_at, a.created_at,
         p.amount paid_amount, p.tip paid_tip, p.method::text paid_method
    from appointments a
    join tenants t on t.id = a.tenant_id
    join branches br on br.id = a.branch_id
    join users u on u.id = a.barber_id
    join clients c on c.id = a.client_id
    join services s on s.id = a.service_id
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

function publicBase() {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  return (process.env.PUBLIC_URL || railway || 'http://localhost:3000').replace(/\/+$/, '')
}

/** Link público para que los clientes reserven (sin nada del equipo a la vista). */
export function bookingLink(slug: string) {
  return `${publicBase()}/r/${slug}`
}

/** Link para que los barberos entren a su agenda (va aparte del link de clientes). */
export function staffLoginLink() {
  return `${publicBase()}/entrar/barbero`
}

export { normalizeCoPhone }
