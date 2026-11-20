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

import { DEMO } from '@/lib/seed'
import { getDb, one } from '@/lib/db'
import { bookingCatalog, tenantBySlug } from '@/lib/booking'
import { closeBranch, reopenBranch, saveBranch } from '@/app/app/actions'

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

beforeAll(async () => {
  await getDb()
  const t = (await tenantBySlug(DEMO.slug))!
  tenantId = t.id
  const u = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where role = 'owner'`))!
  me = { ...u, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
})

describe('closing a branch', () => {
  it('refuses to close the only open branch', async () => {
    const b = (await one<{ id: string }>(`select id from branches where name = 'Villa Hermosa'`))!
    expect(await run(closeBranch(form({ id: b.id })))).toContain('err=No puedes cerrar la única sede abierta')
  })

  it('refuses while the branch still has active barbers, and names them', async () => {
    await run(saveBranch(form({ id: '', name: 'Sede Dos', address: '' })))
    const b = (await one<{ id: string }>(`select id from branches where name = 'Villa Hermosa'`))!
    const r = await run(closeBranch(form({ id: b.id })))
    expect(r).toContain('err=Antes de cerrar Villa Hermosa')
    expect(r).toContain('Andrés Rojas')
    const dos = (await one<{ id: string }>(`select id from branches where name = 'Sede Dos'`))!
    await run(closeBranch(form({ id: dos.id })))
  })

  it('closes an empty branch: it leaves booking, and can be reopened', async () => {
    await run(saveBranch(form({ id: '', name: 'Sede Prueba', address: 'Calle 1' })))
    const b = (await one<{ id: string }>(`select id from branches where name = 'Sede Prueba'`))!
    expect((await bookingCatalog(tenantId)).branches.map((x) => x.id)).toContain(b.id)
    expect(await run(closeBranch(form({ id: b.id })))).toContain('ok=Sede Prueba quedó cerrada')
    expect((await bookingCatalog(tenantId)).branches.map((x) => x.id)).not.toContain(b.id)
    expect(await run(reopenBranch(form({ id: b.id })))).toContain('ok=Sede abierta de nuevo')
    expect((await bookingCatalog(tenantId)).branches.map((x) => x.id)).toContain(b.id)
    await run(closeBranch(form({ id: b.id })))
  })
})

describe('deactivating a barber', () => {
  it('refuses while the barber has upcoming appointments', async () => {
    const { saveBarber } = await import('@/app/app/actions')
    const a = (await one<{ id: string; name: string; phone: string; branch_id: string }>(`select id, name, phone, branch_id from users where phone = $1`, [DEMO.barbers[0].phone]))!
    const n = (await one<{ n: number }>(`select count(*)::int n from appointments where barber_id = $1 and status in ('pending','confirmed') and starts_at > now()`, [a.id]))!.n
    expect(n).toBeGreaterThan(0)
    const r = await run(saveBarber(form({ id: a.id, name: a.name, phone: a.phone, branch: a.branch_id })))
    expect(r).toContain(`err=${a.name} tiene`)
    expect((await one<{ active: boolean }>(`select active from users where id = $1`, [a.id]))!.active).toBe(true)
  })
})
