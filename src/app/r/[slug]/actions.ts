'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { rememberHost } from '@/lib/base-url'
import { revalidatePath } from 'next/cache'
import { cancelByClient } from '@/lib/appointments'
import { BookingError, createAppointment, tenantBySlug } from '@/lib/booking'
import { normalizeCoPhone } from '@/lib/phone'
import { one } from '@/lib/db'
import { z } from 'zod'
import { zOptText, zUuid } from '@/lib/validate'

const MAX_PENDING = 3

export type BookingResult = { ok: true; id: string } | { ok: false; error: string }

const BookingInput = z.object({
  slug: z.string().min(1).max(80),
  branchId: zUuid,
  serviceIds: z.array(zUuid).min(1).max(8),
  start: z.string().max(40),
  barberId: z.union([zUuid, z.literal(''), z.null(), z.undefined()]).transform((v) => v || null),
  phone: z.string().max(30),
  name: zOptText(80).transform((v) => v ?? ''),
  note: zOptText(300),
})

export async function requestBooking(raw: {
  slug: string
  branchId: string
  serviceIds: string[]
  start: string
  barberId: string | null
  phone: string
  name: string
  note: string | null
}): Promise<BookingResult> {
  // lo que llega del navegador se revisa: un valor alterado da un mensaje, no un error del servidor
  const parsed = BookingInput.safeParse(raw)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return {
      ok: false,
      error: field === 'serviceIds' ? 'Elige al menos un servicio' : field === 'branchId' ? 'Elige la sede' : field === 'barberId' ? 'Manicurista no disponible' : 'Revisa los datos de la reserva',
    }
  }
  const input = parsed.data
  try {
    rememberHost((await headers()).get('host'))
  } catch {}
  const t = await tenantBySlug(input.slug)
  if (!t) return { ok: false, error: 'Spa no encontrado' }
  const phone = normalizeCoPhone(input.phone)
  if (!phone) return { ok: false, error: 'Revisa el número: son 10 dígitos y empieza por 3.' }
  let name = input.name
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
    return { ok: false, error: 'Ya tienes solicitudes esperando confirmación. Te escribimos por WhatsApp apenas la manicurista responda.' }
  const start = new Date(input.start)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Elige una hora' }
  try {
    const id = await createAppointment({
      tenantId: t.id,
      branchId: input.branchId,
      serviceIds: input.serviceIds,
      start,
      barberId: input.barberId,
      clientName: name,
      clientPhone: phone,
      note: input.note,
      source: 'online',
    })
    return { ok: true, id }
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, error: e.message }
    console.error(e)
    return { ok: false, error: 'No pudimos guardar tu solicitud. Intenta de nuevo.' }
  }
}

/** "Cancelar mi cita" desde la página de la reserva (formulario con confirmación). */
export async function cancelMyAppointment(fd: FormData) {
  const slug = String(fd.get('slug') ?? '')
  const id = String(fd.get('id') ?? '')
  const to = `/r/${encodeURIComponent(slug)}/cita/${encodeURIComponent(id)}`
  try {
    await cancelByClient(slug, id)
  } catch (e) {
    if (e instanceof BookingError) redirect(`${to}?err=${encodeURIComponent(e.message)}`)
    throw e
  }
  revalidatePath(to)
  redirect(`${to}?ok=${encodeURIComponent('Listo, cancelamos tu cita. Te enviamos la confirmación por WhatsApp.')}`)
}
