import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one } from '@/lib/db'
import { login } from '@/lib/auth'
import { normalizeLoginPhone } from '@/lib/phone'
import { DEMO, upgradeDemoLogins } from '@/lib/seed'

beforeAll(async () => {
  await getDb()
})

describe('entrar', () => {
  it('acepta un celular o un código corto de prueba, y nada más', () => {
    expect(normalizeLoginPhone('3000')).toBe('3000')
    expect(normalizeLoginPhone('+57 310 482 7719')).toBe('3104827719')
    expect(normalizeLoginPhone('30')).toBeNull()
    expect(normalizeLoginPhone('310 123')).toBeNull()
    expect(normalizeLoginPhone('abc')).toBeNull()
  })

  it('los usuarios de prueba entran con su código y el PIN', async () => {
    expect(await login(DEMO.owner.phone, DEMO.owner.pin)).toBe('ok')
    expect(await login(DEMO.barbers[0].phone, DEMO.barbers[0].pin)).toBe('ok')
    expect(await login(DEMO.owner.phone, '9999')).toBe('bad')
    expect(await login('30', DEMO.owner.pin)).toBe('bad')
  })

  it('la entrada común de la demo (1111 / 1111) abre al dueño, y por "Manicurista" pide elegir', async () => {
    expect(await login(DEMO.login.phone, DEMO.login.pin, 'owner')).toBe('ok')
    expect(await login(DEMO.login.phone, DEMO.login.pin, 'barber')).toBe('pick')
    expect(await login(DEMO.login.phone, '1234', 'owner')).toBe('bad')
    await one('delete from login_attempts where phone = $1', [DEMO.login.phone])
  })

  it('una demo con el PIN viejo 1234 pasa a 1111', async () => {
    const db = await getDb()
    const { hashPin } = await import('@/lib/pin')
    await db.query(`update users set pin_hash = $2 where phone = $1`, [DEMO.barbers[2].phone, hashPin('1234')])
    await upgradeDemoLogins(db)
    expect(await login(DEMO.barbers[2].phone, '1111')).toBe('ok')
  })

  it('una demo creada antes con celulares largos pasa a los códigos cortos', async () => {
    const db = await getDb()
    await db.query(`update users set phone = '3001111111' where phone = $1`, [DEMO.barbers[0].phone])
    await upgradeDemoLogins(db)
    const u = await one<{ phone: string }>(`select phone from users where name = $1`, [DEMO.barbers[0].name])
    expect(u?.phone).toBe(DEMO.barbers[0].phone)
    expect(await login(DEMO.barbers[0].phone, DEMO.barbers[0].pin)).toBe('ok')
  })

  it('después de 5 PIN incorrectos se bloquea, incluso con el PIN correcto', async () => {
    const phone = DEMO.barbers[1].phone
    for (let i = 0; i < 4; i++) expect(await login(phone, '0000')).toBe('bad')
    expect(await login(phone, '0000')).toBe('locked')
    expect(await login(phone, DEMO.barbers[1].pin)).toBe('locked')
    // pasado el bloqueo vuelve a entrar y el contador se borra
    await one(`update login_attempts set locked_until = now() - interval '1 minute' where phone = $1`, [phone])
    expect(await login(phone, DEMO.barbers[1].pin)).toBe('ok')
    expect(await one(`select 1 from login_attempts where phone = $1`, [phone])).toBeNull()
  })
})
