import { one, rows, tx } from './db'
import type { CurrentUser } from './auth'
import { apptView, bookingLink, BookingError, type ApptView } from './booking'
import { firstName } from './phone'
import { sendWhatsApp } from './whatsapp'
import { settlePending } from './payroll'

/** Dueño: todo. Barbero: solo sus propias citas. */
async function loadForUser(user: CurrentUser, id: string): Promise<ApptView> {
  const a = await apptView(id)
  if (!a || a.tenant_id !== user.tenant_id) throw new BookingError('Cita no encontrada')
  if (user.role !== 'owner' && a.barber_id !== user.id) throw new BookingError('Esta cita es de otro barbero')
  return a
}

/**
 * Cambia el estado solo si la cita sigue en uno de los estados esperados (en la misma consulta).
 * Así, si el barbero y el dueño tocan a la vez "Confirmar" y "Cancelar", gana uno solo y el cliente
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
      vars: { nombre: firstName(a.client_name), fecha: a.day, hora: a.time, barbero: a.barber_name, sede: a.branch_name, direccion: a.branch_address ?? '' },
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

/** Solo el barbero responsable o el dueño pueden cancelar. */
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

export async function markNoShow(user: CurrentUser, id: string) {
  const a = await loadForUser(user, id)
  if (a.status !== 'confirmed') throw new BookingError('Solo una cita confirmada puede marcarse como "no vino"')
  await transition(id, ['confirmed'], `status = 'no_show', decided_at = now(), decided_by = $3`, [user.id], 'Solo una cita confirmada puede marcarse como "no vino"')
}

export const PAY_METHODS = ['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'] as const
export type PayMethod = (typeof PAY_METHODS)[number]

/** Cobrar la visita: registra el pago y deja la cita como atendida. */
export class AlreadyPaid extends BookingError {}

export async function checkout(user: CurrentUser, id: string, amount: number, tip: number, method: PayMethod) {
  const a = await loadForUser(user, id)
  if (a.status === 'completed' && a.paid_amount !== null) throw new AlreadyPaid('Esta visita ya estaba cobrada')
  if (!['confirmed', 'pending'].includes(a.status)) throw new BookingError('Esta cita no se puede cobrar')
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
    // comisión congelada al cobrar, con el esquema vigente del barbero
    await settlePending(on, a.tenant_id)
  }).catch(async (e) => {
    const now = await apptView(id)
    if (now?.status === 'completed' && now.paid_amount !== null) throw new AlreadyPaid('Esta visita ya estaba cobrada')
    throw e
  })
}

// ---------------- tareas automáticas ----------------

const g = globalThis as unknown as { __barbarJobs?: Promise<void> | null }

/** Avisos al dueño por solicitudes sin respuesta y recordatorios 2 h antes. Seguro de llamar muchas veces. */
export function runDueJobs(now = new Date()) {
  if (g.__barbarJobs) return g.__barbarJobs
  g.__barbarJobs = (async () => {
    try {
      await alertOverdueApprovals(now)
      await sendReminders(now)
    } catch (e) {
      console.error('[barbar] tareas automáticas:', e)
    } finally {
      g.__barbarJobs = null
    }
  })()
  return g.__barbarJobs
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
        vars: { barbero: a.barber_name, cliente: a.client_name, fecha: a.day, hora: a.time },
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
      vars: { nombre: firstName(a.client_name), hora: a.time, barbero: a.barber_name, sede: a.branch_name },
    })
  }
}
