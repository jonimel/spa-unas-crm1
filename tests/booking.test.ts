import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { approvalDeadline, BookingError, createAppointment, slotsFor, tenantBySlug, type Tenant } from '@/lib/booking'
import { approve, cancel, checkout, runDueJobs } from '@/lib/appointments'
import type { CurrentUser } from '@/lib/auth'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, todayYmd, weekdayOf } from '@/lib/time'

let t: Tenant
let branchId: string
let serviceId: string
let ymd: string

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  branchId = (await one<{ id: string }>(`select id from branches where name = 'El Poblado'`))!.id
  serviceId = (await one<{ id: string }>(`select id from services where name = 'Manicure tradicional'`))!.id
  ymd = addDaysYmd(todayYmd(t.timezone), 5)
  while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
})

const asUser = async (phone: string): Promise<CurrentUser> => {
  const u = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where phone = $1`, [phone]))!
  return { ...u, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
}

describe('online booking', () => {
  it('books a free slot as pending, then refuses the same barber at the same time', async () => {
    const slots = await slotsFor(t, { branchId, durationMin: 45, ymd })
    const slot = slots.find((s) => s.barberIds.length >= 1)!
    const barberId = slot.barberIds[0]
    const id = await createAppointment({ tenantId: t.id, branchId, serviceId, start: slot.start, barberId, clientName: 'Prueba Uno', clientPhone: '3190000001', source: 'online' })
    const a = await one<{ status: string; approval_deadline: Date }>('select status, approval_deadline from appointments where id = $1', [id])
    expect(a!.status).toBe('pending')
    await expect(
      createAppointment({ tenantId: t.id, branchId, serviceId, start: slot.start, barberId, clientName: 'Prueba Dos', clientPhone: '3190000002', source: 'online' }),
    ).rejects.toBeInstanceOf(BookingError)
    const msgs = await rows<{ template: string }>('select template from messages where appointment_id = $1 order by created_at', [id])
    expect(msgs.map((m) => m.template).sort()).toEqual(['manicurista_nueva_solicitud', 'solicitud_recibida'])
  })

  it('approval deadline is 2 h, or 30 min before the appointment if sooner', () => {
    const created = new Date('2026-11-16T14:00:00Z')
    expect(approvalDeadline(t, created, new Date('2026-11-17T14:00:00Z')).toISOString()).toBe('2026-11-16T16:00:00.000Z')
    expect(approvalDeadline(t, created, new Date('2026-11-16T15:30:00Z')).toISOString()).toBe('2026-11-16T15:00:00.000Z')
  })

  it('a barber cannot approve or cancel another barber’s appointment; the owner can', async () => {
    const slots = await slotsFor(t, { branchId, durationMin: 45, ymd })
    const slot = slots[slots.length - 1]
    const id = await createAppointment({ tenantId: t.id, branchId, serviceId, start: slot.start, barberId: null, clientName: 'Prueba Tres', clientPhone: '3190000003', source: 'online' })
    const appt = (await one<{ barber_id: string }>('select barber_id from appointments where id = $1', [id]))!
    const other = (await one<{ phone: string }>(`select phone from users where role = 'barber' and id <> $1 limit 1`, [appt.barber_id]))!
    await expect(approve(await asUser(other.phone), id)).rejects.toThrow('otra manicurista')
    await expect(cancel(await asUser(other.phone), id)).rejects.toThrow('otra manicurista')
    const owner = await asUser(DEMO.owner.phone)
    await approve(owner, id)
    await checkout(owner, id, 20000, 5000, 'nequi')
    const done = await one<{ status: string }>('select status from appointments where id = $1', [id])
    expect(done!.status).toBe('completed')
  })

  it('alerts the owner when a barber does not answer in time, and sends the 2 h reminder', async () => {
    const start = new Date(Date.now() + 3 * 3600_000)
    const appt = (await one<{ id: string }>(`select id from appointments where status = 'pending' and approval_deadline < now() and owner_alerted_at is null limit 1`))!
    expect(appt).toBeTruthy()
    await runDueJobs(new Date())
    const alert = await one(`select 1 from alerts where appointment_id = $1 and kind = 'approval_timeout'`, [appt.id])
    expect(alert).toBeTruthy()
    const confirmed = (await one<{ id: string; starts_at: Date }>(`select id, starts_at from appointments where status = 'confirmed' and starts_at > $1 order by starts_at limit 1`, [start]))!
    await runDueJobs(new Date(new Date(confirmed.starts_at).getTime() - 90 * 60_000))
    const rem = await one(`select 1 from messages where appointment_id = $1 and template = 'recordatorio'`, [confirmed.id])
    expect(rem).toBeTruthy()
  })
})
