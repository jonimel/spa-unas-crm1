import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { createShop, slugify } from '@/lib/signup'
import { exportTenant, isShared } from '@/lib/backup'
import { login } from '@/lib/auth'
import { DEMO, showDemoLogins } from '@/lib/seed'

const base = { shop: 'Spa Uñas Divinas', city: 'Cali', branch: '', address: 'Cl. 5 #40-12', owner: 'Ana Torres', phone: '3112223344', pin: '4321', pin2: '4321' }

beforeAll(async () => {
  await getDb()
})

describe('registrar un spa', () => {
  it('slug sin tildes ni símbolos', () => {
    expect(slugify('Spa Ñoño & Co.')).toBe('spa-nono-y-co')
    expect(slugify('***')).toBe('spa')
  })

  it('crea spa, sede, dueño y servicios; el dueño entra con su celular', async () => {
    const r = await createShop(base)
    expect(r.slug).toBe('spa-unas-divinas')
    const branches = await rows<{ name: string }>('select name from branches where tenant_id = $1', [r.tenantId])
    expect(branches.map((b) => b.name)).toEqual(['Cali'])
    expect((await rows('select 1 from services where tenant_id = $1', [r.tenantId])).length).toBe(6)
    const o = await one<{ role: string }>('select role from users where id = $1', [r.ownerId])
    expect(o!.role).toBe('owner')
    expect(await login('311 222 3344', '4321')).toBe('ok')
  })

  it('el mismo nombre recibe otro link', async () => {
    const r = await createShop({ ...base, phone: '3112223345' })
    expect(r.slug).toBe('spa-unas-divinas-2')
  })

  it('no repite celular, valida PIN y nombre', async () => {
    await expect(createShop({ ...base, shop: 'Otra' })).rejects.toThrow('ya tiene cuenta')
    await expect(createShop({ ...base, phone: '3112223399', pin2: '1111' })).rejects.toThrow('no son iguales')
    await expect(createShop({ ...base, phone: '3112223399', pin: '12' , pin2: '12' })).rejects.toThrow('PIN')
    await expect(createShop({ ...base, phone: '12345' })).rejects.toThrow('no válido')
    await expect(createShop({ ...base, phone: '3112223399', shop: ' ' })).rejects.toThrow('nombre del spa')
  })
})

describe('copias con varios spas', () => {
  it('la descarga del dueño trae solo su spa y sin PIN', async () => {
    expect(await isShared()).toBe(true)
    const demo = (await one<{ id: string }>('select id from tenants where slug = $1', [DEMO.slug]))!
    const { name, bytes } = await exportTenant(demo.id)
    expect(name).toMatch(/^spa-bella-.*\.json$/)
    const data = JSON.parse(bytes.toString())
    const tenantIds = new Set<string>()
    for (const v of Object.values(data)) if (Array.isArray(v)) for (const row of v) tenantIds.add(row.tenant_id)
    expect([...tenantIds]).toEqual([demo.id])
    expect(JSON.stringify(data.users)).not.toContain('pin_hash')
    expect(data.clients.length).toBeGreaterThan(10)
    expect(data).not.toHaveProperty('sessions')
  })
})

describe('usuarios de prueba en la página de inicio', () => {
  it('se ven en el computador y no en Railway', () => {
    const env = { ...process.env }
    delete process.env.SHOW_DEMO_LOGINS
    delete process.env.RAILWAY_ENVIRONMENT
    expect(showDemoLogins()).toBe(true)
    process.env.RAILWAY_ENVIRONMENT = 'production'
    expect(showDemoLogins()).toBe(false)
    process.env.SHOW_DEMO_LOGINS = '1'
    expect(showDemoLogins()).toBe(true)
    process.env = env
  })
})
