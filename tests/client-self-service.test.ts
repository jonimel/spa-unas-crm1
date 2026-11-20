import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { apptView, createAppointment, spaWhatsApp, tenantBySlug, type Tenant } from '@/lib/booking'
import { cancelByClient, clientCanCancel } from '@/lib/appointments'
import { appointmentIcs, icsText } from '@/lib/ics'
import { waLink } from '@/lib/phone'
import { GET as icsRoute } from '@/app/api/r/[slug]/cita/[id]/calendario/route'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, atLocal, todayYmd, weekdayOf } from '@/lib/time'

// Lo que la clienta puede hacer sola desde la página de su reserva: calendario, WhatsApp al spa y cancelar.

let t: Tenant
let branchId: string
let camila: string
const svc: Record<string, string> = {}

const workday = (offset: number) => {
  let ymd = addDaysYmd(todayYmd(t.timezone), offset)
  while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
  return ymd
}
const book = (start: Date, names: string[], phone: string | null = '3175559001') =>
  createAppointment({
    tenantId: t.id, branchId, serviceIds: names.map((n) => svc[n]), start, barberId: camila,
    clientName: 'Sofía Prueba', clientPhone: phone, source: 'staff',
  })

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  branchId = (await one<{ id: string }>(`select id from branches where tenant_id = $1 and active order by sort limit 1`, [t.id]))!.id
  for (const s of await rows<{ id: string; name: string }>('select id, name from services where tenant_id = $1', [t.id])) svc[s.name] = s.id
  camila = (await one<{ id: string }>(`select id from users where phone = $1`, [DEMO.barbers[0].phone]))!.id
})

describe('agregar a mi calendario (.ics)', () => {
  it('arma un evento con el spa, los servicios, la sede y la duración total', async () => {
    const start = atLocal(workday(20), 6 * 60, t.timezone)
    const id = await book(start, ['Manicure semipermanente', 'Pedicure tradicional'])
    const a = (await apptView(id))!
    const ics = appointmentIcs(a, `http://x/r/${t.slug}/cita/${id}`, new Date('2026-01-01T00:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(`UID:${id}@spa-unas-crm`)
    expect(unfolded).toContain(`DTSTART:${start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)
    const end = new Date(start.getTime() + a.duration_min * 60_000)
    expect(unfolded).toContain(`DTEND:${end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)
    expect(unfolded).toContain('SUMMARY:Spa Uñas Bella: Manicure semipermanente + Pedicure tradicional')
    expect(unfolded).toContain('LOCATION:Spa Uñas Bella\\, El Poblado\\, Cl. 10 #40-25\\, local 104')
    // ninguna línea pasa de 75 octetos
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
  })

  it('escapa comas, punto y coma y saltos de línea', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
  })

  it('la ruta lo descarga como text/calendar; otra cita u otro spa dan 404', async () => {
    const id = await book(atLocal(workday(21), 6 * 60, t.timezone), ['Manicure tradicional'])
    const ok = await icsRoute(new Request('http://x'), { params: Promise.resolve({ slug: t.slug, id }) } as never)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/calendar')
    expect(await ok.text()).toContain('BEGIN:VEVENT')
    const wrong = await icsRoute(new Request('http://x'), { params: Promise.resolve({ slug: 'otro-spa', id }) } as never)
    expect(wrong.status).toBe(404)
    const bad = await icsRoute(new Request('http://x'), { params: Promise.resolve({ slug: t.slug, id: 'nada' }) } as never)
    expect(bad.status).toBe(404)
  })
})

describe('escribir al spa por WhatsApp', () => {
  it('usa el celular de la sede, con el texto de la cita', async () => {
    expect(await spaWhatsApp(t.id, branchId)).toBe('3045550101')
    expect(waLink('3045550101', 'Hola, quiero cambiar mi cita')).toBe('https://wa.me/573045550101?text=Hola%2C%20quiero%20cambiar%20mi%20cita')
  })
})

describe('la clienta cancela su cita', () => {
  it('cancela, le confirma por WhatsApp y avisa a su manicurista y a la dueña', async () => {
    const id = await book(atLocal(workday(22), 6 * 60, t.timezone), ['Manicure tradicional'], '3175559002')
    await cancelByClient(t.slug, id)
    const a = (await one<{ status: string; cancel_reason: string }>('select status, cancel_reason from appointments where id = $1', [id]))!
    expect(a).toEqual({ status: 'cancelled', cancel_reason: 'Cancelada por la clienta' })
    const msgs = await rows<{ template: string; to_kind: string; to_phone: string }>(
      `select template, to_kind, to_phone from messages where appointment_id = $1 order by template`,
      [id],
    )
    expect(msgs).toEqual([
      { template: 'cancelada_por_clienta', to_kind: 'client', to_phone: '3175559002' },
      { template: 'manicurista_cita_cancelada', to_kind: 'barber', to_phone: DEMO.barbers[0].phone },
    ])
    const alerts = await rows<{ role: string }>(
      `select u.role from alerts al join users u on u.id = al.user_id where al.appointment_id = $1 and al.kind = 'client_cancelled' order by u.role`,
      [id],
    )
    expect(alerts.map((x) => x.role).sort()).toEqual(['barber', 'owner'])
    // una segunda vez no hace nada
    await expect(cancelByClient(t.slug, id)).rejects.toThrow('ya no se puede cancelar')
  })

  it('a menos de 2 horas no deja cancelar, ni con el link de otro spa', async () => {
    const start = atLocal(workday(23), 6 * 60, t.timezone)
    const id = await book(start, ['Manicure tradicional'], '3175559003')
    const a = (await apptView(id))!
    expect(clientCanCancel(a, new Date(start.getTime() - 3 * 3600_000))).toBe(true)
    expect(clientCanCancel(a, new Date(start.getTime() - 90 * 60_000))).toBe(false)
    await expect(cancelByClient(t.slug, id, new Date(start.getTime() - 90 * 60_000))).rejects.toThrow('menos de 2 horas')
    await expect(cancelByClient('otro-spa', id)).rejects.toThrow('no encontrada')
    expect((await one<{ status: string }>('select status from appointments where id = $1', [id]))!.status).toBe('confirmed')
  })
})
