'use server'

import { BookingError, createAppointment, tenantBySlug } from '@/lib/booking'
import { normalizeCoPhone } from '@/lib/phone'
import { one } from '@/lib/db'

const MAX_PENDING = 3

export type BookingResult = { ok: true; id: string } | { ok: false; error: string }

export async function requestBooking(input: {
  slug: string
  branchId: string
  serviceId: string
  start: string
  barberId: string | null
  phone: string
  name: string
  note: string
}): Promise<BookingResult> {
  const t = await tenantBySlug(input.slug)
  if (!t) return { ok: false, error: 'Barbería no encontrada' }
  const phone = normalizeCoPhone(input.phone)
  if (!phone) return { ok: false, error: 'Revisa el número: son 10 dígitos y empieza por 3.' }
  let name = input.name.trim().slice(0, 80)
  if (!name) {
    const known = await one<{ name: string }>('select name from clients where tenant_id = $1 and phone = $2', [t.id, phone])
    if (!known) return { ok: false, error: 'Escribe tu nombre' }
    name = known.name
  }
  // freno a solicitudes en serie (spam o alguien probando): máximo 3 pendientes por celular
  const open = await one<{ n: number }>(
    `select count(*)::int n from appointments a join clients c on c.id = a.client_id
      where a.tenant_id = $1 and c.phone = $2 and a.status = 'pending' and a.starts_at > now()`,
    [t.id, phone],
  )
  if (open && open.n >= MAX_PENDING)
    return { ok: false, error: 'Ya tienes solicitudes esperando confirmación. Te escribimos por WhatsApp apenas el barbero responda.' }
  const start = new Date(input.start)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Elige una hora' }
  try {
    const id = await createAppointment({
      tenantId: t.id,
      branchId: input.branchId,
      serviceId: input.serviceId,
      start,
      barberId: input.barberId || null,
      clientName: name,
      clientPhone: phone,
      note: input.note.trim().slice(0, 300) || null,
      source: 'online',
    })
    return { ok: true, id }
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message }
    console.error(e)
    return { ok: false, error: 'No pudimos guardar tu solicitud. Intenta de nuevo.' }
  }
}
