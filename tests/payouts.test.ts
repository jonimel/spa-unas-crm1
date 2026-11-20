import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { tenantBySlug, type Tenant } from '@/lib/booking'
import { ledgers, payoutsFor } from '@/lib/payroll'
import { rentPeriodsStarted } from '@/lib/commission'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, todayYmd, weekdayOf } from '@/lib/time'

let t: Tenant
let today: string
const barberId = async (i: number) => (await one<{ id: string }>(`select id from users where phone = $1`, [DEMO.barbers[i].phone]))!.id

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  today = todayYmd(t.timezone)
})

describe('rent periods', () => {
  it('counts the periods that have started, including the current one', () => {
    expect(rentPeriodsStarted('2026-11-02', '2026-11-01', 'weekly')).toBe(0)
    expect(rentPeriodsStarted('2026-11-02', '2026-11-02', 'weekly')).toBe(1)
    expect(rentPeriodsStarted('2026-11-02', '2026-11-08', 'weekly')).toBe(1)
    expect(rentPeriodsStarted('2026-11-02', '2026-11-09', 'weekly')).toBe(2)
    expect(rentPeriodsStarted('2026-11-02', '2026-11-02', 'daily')).toBe(1)
    expect(rentPeriodsStarted('2026-11-02', '2026-11-04', 'daily')).toBe(3)
    expect(rentPeriodsStarted('2026-01-31', '2026-02-27', 'monthly')).toBe(1)
    expect(rentPeriodsStarted('2026-01-31', '2026-02-28', 'monthly')).toBe(2)
    expect(rentPeriodsStarted('2026-01-31', '2026-03-30', 'monthly')).toBe(2)
    expect(rentPeriodsStarted('2026-01-31', '2026-03-31', 'monthly')).toBe(3)
    expect(rentPeriodsStarted('2026-10-15', '2026-11-14', 'monthly')).toBe(1)
    expect(rentPeriodsStarted('2026-10-15', '2026-11-15', 'monthly')).toBe(2)
  })
})

describe('barber balances (demo data)', () => {
  it('balance = earned - paid, and only this week is still owed', async () => {
    const all = await ledgers(t.id, today)
    const monday = addDaysYmd(today, -((weekdayOf(today) + 6) % 7))
    for (const i of [0, 1, 2]) {
      const id = await barberId(i)
      const l = all.get(id)!
      const paid = (await one<{ s: number }>(`select coalesce(sum(amount),0)::int s from barber_payouts where barber_id = $1 and kind <> 'arriendo' and voided_at is null`, [id]))!.s
      expect(l.paid).toBe(paid)
      expect(l.owed).toBe(l.earned - l.paid)
      // lo pendiente es lo ganado desde el lunes (menos un adelanto de esta semana, si lo hubo)
      const since = (await one<{ s: number }>(
        `select coalesce(sum(barber_share + barber_tip),0)::int s from payments where barber_id = $1 and (paid_at at time zone $3)::date >= $2::date`,
        [id, monday, t.timezone],
      ))!.s
      const adv = (await one<{ s: number }>(`select coalesce(sum(amount),0)::int s from barber_payouts where barber_id = $1 and kind = 'adelanto' and paid_on >= $2::date`, [id, monday]))!.s
      expect(l.owed).toBe(since - adv)
      expect(l.rentDue).toBe(0)
    }
  })

  it('the chair renter owes only the rent of the current week', async () => {
    const l = (await ledgers(t.id, today)).get(await barberId(3))!
    expect(l.earned).toBe(0)
    expect(l.owed).toBe(0)
    expect(l.rentOwed).toBe(350000)
    const list = await payoutsFor(t.id, await barberId(3), 5)
    expect(list[0].kind).toBe('arriendo')
  })

  it('every payout belongs to a barber of the same shop and has a positive amount', async () => {
    const bad = await rows(`select p.id from barber_payouts p join users u on u.id = p.barber_id where u.tenant_id <> p.tenant_id or p.amount <= 0`)
    expect(bad).toHaveLength(0)
  })
})
