import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '@/lib/auth'

let me: CurrentUser
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error('redirect:' + decodeURIComponent(to).replace(/\+/g, ' '))
  },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), requireUser: async () => me }))

import { getDb, one } from '@/lib/db'
import { tenantBySlug } from '@/lib/booking'
import { ledgers, schemesFor } from '@/lib/payroll'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, todayYmd } from '@/lib/time'
import { recordPayout, saveBarberScheme, voidPayout } from '@/app/app/actions'

const form = (o: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(o)) fd.set(k, v)
  return fd
}
const run = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as Error).message
  }
  return 'no redirect'
}

let tenantId: string
let tz: string
let camilo: string

beforeAll(async () => {
  await getDb()
  const t = (await tenantBySlug(DEMO.slug))!
  tenantId = t.id
  tz = t.timezone
  const u = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where role = 'owner'`))!
  me = { ...u, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
  camilo = (await one<{ id: string }>(`select id from users where phone = $1`, [DEMO.barbers[1].phone]))!.id
})

const owed = async (id: string) => (await ledgers(tenantId, todayYmd(tz), id)).get(id)!

describe('recording payments to a barber', () => {
  it('a payment lowers the balance, and voiding it brings it back', async () => {
    const before = (await owed(camilo)).owed
    const r = await run(recordPayout(form({ id: camilo, kind: 'pago', amount: '120.000', method: 'nequi', date: todayYmd(tz), note: 'prueba' })))
    expect(r).toContain('ok=Pago registrado')
    expect((await owed(camilo)).owed).toBe(before - 120000)
    const p = (await one<{ id: string; created_by: string }>(`select id, created_by from barber_payouts where barber_id = $1 and note = 'prueba'`, [camilo]))!
    expect(p.created_by).toBe(me.id)
    expect(await run(voidPayout(form({ id: camilo, payout: p.id })))).toContain('ok=Pago anulado')
    expect((await owed(camilo)).owed).toBe(before)
  })

  it('rejects an empty amount, an unknown method and a future date', async () => {
    const ok = { id: camilo, kind: 'adelanto', amount: '50000', method: 'efectivo', date: todayYmd(tz) }
    expect(await run(recordPayout(form({ ...ok, amount: '' })))).toContain('err=Escribe el valor')
    expect(await run(recordPayout(form({ ...ok, method: 'tarjeta' })))).toContain('err=Elige cómo se pagó')
    expect(await run(recordPayout(form({ ...ok, date: addDaysYmd(todayYmd(tz), 1) })))).toContain('err=Revisa la fecha')
    expect(await run(recordPayout(form({ ...ok, kind: 'regalo' })))).toContain('err=Elige el tipo de pago')
  })

  it('moving a barber to chair rent starts the rent today, and keeps that date on later saves', async () => {
    const today = todayYmd(tz)
    const save = () => run(saveBarberScheme(form({ id: camilo, model: 'rent', rentAmount: '200.000', rentPeriod: 'weekly' })))
    expect(await save()).toContain('tab=esquema')
    expect((await schemesFor(tenantId)).get(camilo)!.rentSince).toBe(today)
    await one(`update barber_pay set rent_since = $2 where barber_id = $1`, [camilo, addDaysYmd(today, -7)])
    await save()
    expect((await schemesFor(tenantId)).get(camilo)!.rentSince).toBe(addDaysYmd(today, -7))
    expect((await owed(camilo)).rentOwed).toBe(400000) // la semana pasada y esta
    // volver a porcentaje borra la fecha del arriendo
    expect(await run(saveBarberScheme(form({ id: camilo, model: 'percent', percent: '' })))).toContain('ok=Esquema guardado')
    expect((await schemesFor(tenantId)).get(camilo)!.rentSince).toBeNull()
  })
})
