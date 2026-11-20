import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { createAppointment, slotsFor, tenantBySlug, type Tenant } from '@/lib/booking'
import { approve, checkout } from '@/lib/appointments'
import { statsFor } from '@/lib/analytics'
import { totalsByBarber } from '@/lib/payroll'
import { period } from '@/lib/periods'
import type { CurrentUser } from '@/lib/auth'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, todayYmd, weekdayOf } from '@/lib/time'

let t: Tenant
let owner: CurrentUser

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  const u = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where role = 'owner'`))!
  owner = { ...u, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
})

describe('commissions', () => {
  it('every seeded payment has its split computed, and the split adds up', async () => {
    const bad = await one<{ n: number }>(`select count(*)::int n from payments where barber_share is null or barber_share + barber_tip + shop_share <> amount + tip`)
    expect(bad!.n).toBe(0)
  })

  it('freezes the barber share when a visit is charged, using the barber scheme', async () => {
    // Camila: 50% general, Uñas acrílicas al 55%
    const camila = (await one<{ id: string; branch_id: string }>(`select id, branch_id from users where phone = $1`, [DEMO.barbers[0].phone]))!
    const svc = (await one<{ id: string }>(`select id from services where name = 'Uñas acrílicas'`))!
    let ymd = addDaysYmd(todayYmd(t.timezone), 6)
    while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
    const slot = (await slotsFor(t, { branchId: camila.branch_id, durationMin: 120, ymd, barberId: camila.id }))[0]
    const id = await createAppointment({ tenantId: t.id, branchId: camila.branch_id, serviceId: svc.id, start: slot.start, barberId: camila.id, clientName: 'Prueba Comisión', clientPhone: '3190000099', source: 'online' })
    await approve(owner, id)
    await checkout(owner, id, 110000, 5000, 'efectivo')
    const p = (await one<{ barber_share: number; barber_tip: number; shop_share: number; rule: string }>(`select barber_share, barber_tip, shop_share, rule from payments where appointment_id = $1`, [id]))!
    expect(p).toMatchObject({ barber_share: 60500, barber_tip: 5000, shop_share: 49500 })
    expect(p.rule).toContain('55%')
  })

  it('totals per barber match the payments table', async () => {
    const per = period('mes', t.timezone)
    const totals = await totalsByBarber(t.id, per.start, per.end)
    const direct = await rows<{ barber_id: string; s: number }>(`select barber_id, sum(barber_share)::int s from payments where paid_at >= $1 and paid_at < $2 group by barber_id`, [per.start, per.end])
    for (const d of direct) expect(totals.find((x) => x.barber_id === d.barber_id)?.barber_share).toBe(d.s)
  })
})

describe('analytics', () => {
  it('computes the month, week and today views for the whole chain and per branch', async () => {
    const month = todayYmd(t.timezone).slice(0, 8) + '01'
    const branch = (await one<{ id: string }>(`select id from branches where name = 'El Poblado'`))!
    for (const view of ['hoy', 'semana', 'mes'] as const) {
      const all = await statsFor(t.id, t.timezone, view, month, null)
      const one_ = await statsFor(t.id, t.timezone, view, month, branch.id)
      expect(all.revenue).toBeGreaterThanOrEqual(one_.revenue)
      expect(all.occupancy).toBeGreaterThanOrEqual(0)
      expect(all.occupancy).toBeLessThanOrEqual(100)
      expect(all.services.reduce((s, x) => s + x.value, 0)).toBe(all.revenue)
    }
    const m = await statsFor(t.id, t.timezone, 'mes', month, null)
    expect(m.months).toHaveLength(6)
    expect(m.heat.length).toBeGreaterThan(0)
  })
})
