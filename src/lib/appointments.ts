import { one, rows, tx } from './db'
import type { CurrentUser } from './auth'
import { apptView, bookingLink, BookingError, type ApptView } from './booking'
import { addDaysYmd, atLocal, fmtSpan, todayYmd } from './time'
import { firstName } from './phone'
import { sendWhatsApp } from './whatsapp'
import { settlePending } from './payroll'
import { isUuid } from './validate'

/** Dueña: todo. Manicurista: solo sus propias citas. */
async function loadForUser(user: CurrentUser, id: string): Promise<ApptView> {
  const a = isUuid(id) ? await apptView(id) : null
  if (!a || a.tenant_id !== user.tenant_id) throw new BookingError('Cita no encontrada')
  if (user.role !== 'owner' && a.barber_id !== user.id) throw new BookingError('Esta cita es de otra manicurista')
  return a
}

/**
 * Cambia el estado solo si la cita sigue en uno de los estados esperados (en la misma consulta).
 * Así, si la manicurista y la dueña tocan a la vez "Confirmar" y "Cancelar", gana uno solo y la clienta
 * no recibe dos mensajes contradictorios.
 */
async function transition(id: string, from: string[], set: string, params: unknown[], msg: string) {
  const r = await one<{ id: string }>(`update appointments set ${set} where id = $1 and status = any($2::text[]::appt_status[]) returning id`, [id, from, ...params])
  if (!r) throw new BookingError(msg)
}

export async function approve(user: CurrentUser, id: string) {
  const a = await loadForUser(user, id)
  if (a.status !== 'pending') throw new BookingError('La cita ya no está pendiente')
  await transition(id, ['pending'], `status = 'confirmed', decided_at = now(), decided_by = $3`, [user.id], 'La cita ya no está pendiente')
  await one(`update alerts set read_at = now() where appointment_id = $1 and read_at is null`, [id])
  if (a.client_phone)
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.client_phone, template: 'cita_confirmada', appointmentId: id,
      vars: { nombre: firstName(a.client_name), fecha: a.day, hora: a.time, manicurista: a.barber_name, sede: a.branch_name, direccion: a.branch_address ?? '' },
    })
}

export async function reject(user: CurrentUser, id: string, reason?: string) {
  const a = await loadForUser(user, id)
  if (a.status !== 'pending') throw new BookingError('La cita ya no está pendiente')
  await transition(id, ['pending'], `status = 'rejected', decided_at = now(), decided_by = $3, cancel_reason = $4`, [user.id, reason ?? null], 'La cita ya no está pendiente')
  await one(`update alerts set read_at = now() where appointment_id = $1 and read_at is null`, [id])
  if (a.client_phone)
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.client_phone, template: 'cita_rechazada', appointmentId: id,
      vars: { nombre: firstName(a.client_name), fecha: a.day, hora: a.time, link: bookingLink(a.tenant_slug) },
    })
}

/** Solo la manicurista responsable o la dueña pueden cancelar. */
export async function cancel(user: CurrentUser, id: string, reason?: string) {
  const a = await loadForUser(user, id)
  if (!['pending', 'confirmed'].includes(a.status)) throw new BookingError('Esta cita no se puede cancelar')
  await transition(id, ['pending', 'confirmed'], `status = 'cancelled', decided_at = now(), decided_by = $3, cancel_reason = $4`, [user.id, reason ?? null], 'Esta cita no se puede cancelar')
  await one(`update alerts set read_at = now() where appointment_id = $1 and read_at is null`, [id])
  if (a.client_phone)
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.client_phone, template: 'cita_cancelada', appointmentId: id,
      vars: { nombre: firstName(a.client_name), fecha: a.day, hora: a.time, link: bookingLink(a.tenant_slug) },
    })
}

/** Hasta cuánto antes de la hora de inicio la clienta puede cancelar sola desde su link. */
export const CLIENT_CANCEL_MIN_MS = 2 * 3600_000

export function clientCanCancel(a: Pick<ApptView, 'status' | 'starts_at'>, now = new Date()) {
  return ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() - now.getTime() >= CLIENT_CANCEL_MIN_MS
}

/**
 * La clienta cancela su propia cita desde la página de su reserva (el link es privado: lleva el id de la cita).
 * Le confirmamos por WhatsApp y avisamos a su manicurista (WhatsApp + aviso en la app) y a la dueña (aviso en la app).
 */
export async function cancelByClient(slug: string, id: string, now = new Date()) {
  const a = isUuid(id) ? await apptView(id) : null
  if (!a || a.tenant_slug !== slug) throw new BookingError('Cita no encontrada')
  if (!['pending', 'confirmed'].includes(a.status)) throw new BookingError('Esta cita ya no se puede cancelar')
  if (!clientCanCancel(a, now)) throw new BookingError(`Faltan menos de ${fmtSpan(CLIENT_CANCEL_MIN_MS / 60_000)} para tu cita: escríbenos por WhatsApp para cancelarla.`)
  await transition(id, ['pending', 'confirmed'], `status = 'cancelled', decided_at = now(), cancel_reason = $3`, ['Cancelada por la clienta'], 'Esta cita ya no se puede cancelar')
  await one(`update alerts set read_at = now() where appointment_id = $1 and read_at is null`, [id])
  const title = `${a.client_name} canceló su cita del ${a.day}, ${a.time} (${a.service_name})`
  const staff = await rows<{ id: string }>(`select id from users where tenant_id = $1 and active and (role = 'owner' or id = $2)`, [a.tenant_id, a.barber_id])
  for (const u of staff)
    await one(`insert into alerts (tenant_id, user_id, kind, title, appointment_id) values ($1, $2, 'client_cancelled', $3, $4)`, [a.tenant_id, u.id, title, id])
  if (a.client_phone)
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.client_phone, template: 'cancelada_por_clienta', appointmentId: id,
      vars: { nombre: firstName(a.client_name), fecha: a.day, hora: a.time, link: bookingLink(a.tenant_slug) },
    })
  if (a.barber_phone)
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.barber_phone, template: 'manicurista_cita_cancelada', appointmentId: id,
      vars: { manicurista: firstName(a.barber_name), cliente: a.client_name, fecha: a.day, hora: a.time },
    })
}

export async function markNoShow(user: CurrentUser, id: string) {
  const a = await loadForUser(user, id)
  if (a.status !== 'confirmed') throw new BookingError('Solo una cita confirmada puede marcarse como "no vino"')
  await transition(id, ['confirmed'], `status = 'no_show', decided_at = now(), decided_by = $3`, [user.id], 'Solo una cita confirmada puede marcarse como "no vino"')
}

export const PAY_METHODS = ['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'] as const
export type PayMethod = (typeof PAY_METHODS)[number]

/** Cobrar la visita: registra el pago y deja la cita como atendida. */
export class AlreadyPaid extends BookingError {}

/** Desde cuánto antes de la hora de inicio se puede cobrar una cita (el mismo margen del botón "Cobrar visita"). */
export const CHARGE_WINDOW_MS = 3 * 3600_000

export function canChargeAt(a: Pick<ApptView, 'status' | 'starts_at'>, now = new Date()) {
  return ['confirmed', 'pending'].includes(a.status) && new Date(a.starts_at).getTime() - now.getTime() < CHARGE_WINDOW_MS
}

export async function checkout(user: CurrentUser, id: string, amount: number, tip: number, method: PayMethod, now = new Date()) {
  const a = await loadForUser(user, id)
  if (a.status === 'completed' && a.paid_amount !== null) throw new AlreadyPaid('Esta visita ya estaba cobrada')
  if (!['confirmed', 'pending'].includes(a.status)) throw new BookingError('Esta cita no se puede cobrar')
  if (!canChargeAt(a, now)) throw new BookingError('Esta cita todavía no se puede cobrar: el cobro se habilita 3 horas antes de la hora de inicio.')
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(tip) || tip < 0) throw new BookingError('Revisa el valor')
  if (!PAY_METHODS.includes(method)) throw new BookingError('Elige el medio de pago')
  await tx(async (on) => {
    // primero el estado (si dos toques llegan juntos, el segundo ya la ve cobrada y no se registra dos veces)
    const r = await one<{ id: string }>(
      `update appointments set status = 'completed', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, $2)
        where id = $1 and status in ('confirmed', 'pending') returning id`,
      [id, user.id],
      on,
    )
    if (!r) throw new BookingError('Esta cita no se puede cobrar')
    await one(
      `insert into payments (tenant_id, appointment_id, branch_id, barber_id, client_id, service_id, amount, tip, method, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.tenant_id, id, a.branch_id, a.barber_id, a.client_id, a.service_id, Math.round(amount), Math.round(tip), method, user.id],
      on,
    )
    // comisión congelada al cobrar (por servicio), con el esquema vigente de la manicurista
    await settlePending(on, a.tenant_id)
    await scheduleRefill(on, a, now)
  }).catch(async (e) => {
    const now = await apptView(id)
    if (now?.status === 'completed' && now.paid_amount !== null) throw new AlreadyPaid('Esta visita ya estaba cobrada')
    throw e
  })
}

// ---------------- tareas automáticas ----------------

const g = globalThis as unknown as { __spaJobs?: Promise<void> | null }

/** Avisos a la dueña por solicitudes sin respuesta, recordatorios 2 h antes y recordatorios de retoque. Seguro de llamar muchas veces. */
export function runDueJobs(now = new Date()) {
  if (g.__spaJobs) return g.__spaJobs
  g.__spaJobs = (async () => {
    try {
      await alertOverdueApprovals(now)
      await sendReminders(now)
      await sendRefillReminders(now)
    } catch (e) {
      console.error('[spa] tareas automáticas:', e)
    } finally {
      g.__spaJobs = null
    }
  })()
  return g.__spaJobs
}

async function alertOverdueApprovals(now: Date) {
  const due = await rows<{ id: string }>(
    `update appointments set owner_alerted_at = $1
      where status = 'pending' and owner_alerted_at is null and approval_deadline <= $1
      returning id`,
    [now],
  )
  for (const { id } of due) {
    const a = await apptView(id)
    if (!a) continue
    const owners = await rows<{ id: string; phone: string }>(`select id, phone from users where tenant_id = $1 and role = 'owner' and active`, [a.tenant_id])
    for (const o of owners) {
      await one(
        `insert into alerts (tenant_id, user_id, kind, title, appointment_id) values ($1, $2, 'approval_timeout', $3, $4)`,
        [a.tenant_id, o.id, `${firstName(a.barber_name)} no aprobó a tiempo la cita de ${a.client_name} (${a.day}, ${a.time})`, id],
      )
      await sendWhatsApp({
        tenantId: a.tenant_id, toPhone: o.phone, template: 'dueno_sin_respuesta', appointmentId: id,
        vars: { manicurista: a.barber_name, cliente: a.client_name, fecha: a.day, hora: a.time },
      })
    }
  }
}

async function sendReminders(now: Date) {
  const due = await rows<{ id: string }>(
    `update appointments a set reminder_sent_at = $1
       from tenants t
      where t.id = a.tenant_id and a.status = 'confirmed' and a.reminder_sent_at is null
        and a.starts_at > $1::timestamptz + interval '15 minutes'
        and a.starts_at <= $1::timestamptz + make_interval(mins => t.reminder_before_min)
      returning a.id`,
    [now],
  )
  for (const { id } of due) {
    const a = await apptView(id)
    if (!a?.client_phone) continue
    await sendWhatsApp({
      tenantId: a.tenant_id, toPhone: a.client_phone, template: 'recordatorio', appointmentId: id,
      vars: { nombre: firstName(a.client_name), hora: a.time, manicurista: a.barber_name, sede: a.branch_name },
    })
  }
}

// ---------------- recordatorio de retoque ----------------

/** Hora local a la que sale el recordatorio de retoque (no a medianoche). */
const REFILL_HOUR = 10 * 60

/**
 * Al cobrar una cita con un servicio que tiene `refill_days` (semipermanente, acrílico…), se agenda el mensaje
 * "es hora de tu retoque" para dentro de N días (el menor de los servicios de la cita). Los recordatorios
 * que la clienta tenía pendientes de antes ya no aplican: este es el nuevo.
 */
export async function scheduleRefill(on: Parameters<typeof settlePending>[0], a: Pick<ApptView, 'id' | 'tenant_id' | 'client_id' | 'client_phone' | 'timezone'>, paidAt = new Date()) {
  const r = (
    await on.query<{ days: number; name: string }>(
      `select s.refill_days days, x.name from appointment_services x join services s on s.id = x.service_id
        where x.appointment_id = $1 and s.refill_days is not null order by s.refill_days, x.sort limit 1`,
      [a.id],
    )
  ).rows[0]
  if (!r || !a.client_phone) return null
  await on.query(`update refill_reminders set skipped_at = now() where client_id = $1 and sent_at is null and skipped_at is null`, [a.client_id])
  const due = atLocal(addDaysYmd(todayYmd(a.timezone, paidAt), r.days), REFILL_HOUR, a.timezone)
  await on.query(`insert into refill_reminders (tenant_id, client_id, appointment_id, service_name, due_at) values ($1,$2,$3,$4,$5)`, [
    a.tenant_id,
    a.client_id,
    a.id,
    r.name,
    due,
  ])
  return due
}

/** Envía los recordatorios de retoque que ya tocan, salvo si la clienta ya tiene otra cita después. */
async function sendRefillReminders(now: Date) {
  const due = await rows<{ id: string; tenant_id: string; client_id: string; appointment_id: string | null; service_name: string; created_at: Date }>(
    `update refill_reminders set sent_at = $1 where sent_at is null and skipped_at is null and due_at <= $1
      returning id, tenant_id, client_id, appointment_id, service_name, created_at`,
    [now],
  )
  for (const r of due) {
    const c = await one<{ name: string; phone: string | null; tenant_name: string; slug: string; starts_at: Date | null; later: boolean }>(
      `select c.name, c.phone, t.name tenant_name, t.slug, a.starts_at,
              exists (select 1 from appointments n where n.client_id = c.id and n.id is distinct from $2
                        and ((n.status in ('pending', 'confirmed') and n.starts_at > $3)
                          or (n.status = 'completed' and n.starts_at > coalesce(a.starts_at, $4)))) later
         from clients c join tenants t on t.id = c.tenant_id left join appointments a on a.id = $2
        where c.id = $1`,
      [r.client_id, r.appointment_id, now, r.created_at],
    )
    if (!c?.phone || c.later) {
      await one(`update refill_reminders set sent_at = null, skipped_at = $2 where id = $1`, [r.id, now])
      continue
    }
    const days = c.starts_at ? Math.max(1, Math.round((now.getTime() - new Date(c.starts_at).getTime()) / 864e5)) : 0
    await sendWhatsApp({
      tenantId: r.tenant_id, toPhone: c.phone, template: 'retoque', appointmentId: r.appointment_id ?? undefined,
      vars: { nombre: firstName(c.name), spa: c.tenant_name, servicio: r.service_name, dias: String(days), link: bookingLink(c.slug) },
    })
  }
}
