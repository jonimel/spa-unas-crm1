import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { BookingError, createAppointment, slotsFor, tenantBySlug, type Tenant } from '@/lib/booking'
import { AlreadyPaid, approve, cancel, checkout } from '@/lib/appointments'
import { requestBooking } from '@/app/r/[slug]/actions'
import { render } from '@/lib/whatsapp'
import type { CurrentUser } from '@/lib/auth'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, atLocal, todayYmd, weekdayOf } from '@/lib/time'

// Errores encontrados en la revisión de QA antes de salir a vender (18 nov 2026)

let t: Tenant
let branchId: string
let serviceId: string
let ymd: string
let owner: CurrentUser
let barberId: string

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  branchId = (await one<{ id: string }>(`select id from branches where tenant_id = $1 and active order by sort limit 1`, [t.id]))!.id
  serviceId = (await one<{ id: string }>(`select id from services where tenant_id = $1 and name = 'Barba'`, [t.id]))!.id
  ymd = addDaysYmd(todayYmd(t.timezone), 8)
  while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
  const o = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where phone = $1`, [DEMO.owner.phone]))!
  owner = { ...o, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
  barberId = (await one<{ id: string }>(`select id from users where tenant_id = $1 and role = 'barber' and active order by name limit 1`, [t.id]))!.id
})

const staff = (start: Date, barber: string) =>
  createAppointment({ tenantId: t.id, branchId, serviceId, start, barberId: barber, clientName: 'QA', clientPhone: null, source: 'staff' })

describe('QA: citas que agenda el equipo', () => {
  it('no acepta un barbero de otra barbería', async () => {
    const t2 = (await one<{ id: string }>(`insert into tenants (slug, name, timezone) values ('qa-otra', 'Otra', 'America/Bogota') returning id`))!.id
    const b2 = (await one<{ id: string }>(`insert into branches (tenant_id, name) values ($1, 'X') returning id`, [t2]))!.id
    const ajeno = (await one<{ id: string }>(
      `insert into users (tenant_id, role, name, phone, pin_hash, branch_id) values ($1, 'barber', 'Ajeno', '3009999998', 'x', $2) returning id`,
      [t2, b2],
    ))!.id
    await expect(staff(atLocal(ymd, 9 * 60, t.timezone), ajeno)).rejects.toThrow('Barbero no disponible')
  })

  it('no acepta un barbero desactivado', async () => {
    await one(`update users set active = false where id = $1`, [barberId])
    try {
      await expect(staff(atLocal(ymd, 8 * 60, t.timezone), barberId)).rejects.toThrow('Barbero no disponible')
    } finally {
      await one(`update users set active = true where id = $1`, [barberId])
    }
  })
})

describe('QA: dos toques a la vez', () => {
  it('cobrar dos veces seguidas registra un solo pago y el segundo no es un error', async () => {
    const id = await staff(atLocal(ymd, 6 * 60, t.timezone), barberId)
    const res = await Promise.allSettled([checkout(owner, id, 20000, 0, 'efectivo'), checkout(owner, id, 20000, 0, 'efectivo')])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failed = res.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(failed.reason).toBeInstanceOf(AlreadyPaid)
    const pays = await rows('select 1 from payments where appointment_id = $1', [id])
    expect(pays).toHaveLength(1)
  })

  it('confirmar y cancelar a la vez: gana uno y el cliente recibe un solo mensaje', async () => {
    const slots = await slotsFor(t, { branchId, durationMin: 30, ymd })
    const s = slots[slots.length - 1]
    const id = await createAppointment({ tenantId: t.id, branchId, serviceId, start: s.start, barberId: s.barberIds[0], clientName: 'QA Carrera', clientPhone: '3190000077', source: 'online' })
    const res = await Promise.allSettled([cancel(owner, id), approve(owner, id)])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((res.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(BookingError)
    const msgs = await rows<{ template: string }>(`select template from messages where appointment_id = $1 and template in ('cita_confirmada', 'cita_cancelada')`, [id])
    expect(msgs).toHaveLength(1)
  })
})

describe('QA: reserva online', () => {
  it('máximo 3 solicitudes pendientes por celular', async () => {
    const phone = '3170000123'
    const slots = (await slotsFor(t, { branchId, durationMin: 30, ymd: addDaysYmd(ymd, 1) })).filter((s) => s.barberIds.length)
    const results = []
    for (const s of slots.slice(0, 4))
      results.push(await requestBooking({ slug: t.slug, branchId, serviceId, start: s.start.toISOString(), barberId: null, phone, name: 'QA Spam', note: '' }))
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true)
    expect(results[3]).toMatchObject({ ok: false })
  })
})

describe('QA: textos de WhatsApp', () => {
  it('sin punto doble después de "p. m."', () => {
    const txt = render('barbero_nueva_solicitud', { barbero: 'Julián', cliente: 'Ana', servicio: 'Barba', fecha: 'Mié 18 de nov', hora: '7:00 p. m.', limite: '6:30 p. m.' })
    expect(txt).not.toContain('m..')
    expect(txt).toContain('7:00 p. m. Apruébala')
    expect(txt.endsWith('6:30 p. m.')).toBe(true)
  })
})
