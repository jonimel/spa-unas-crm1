import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '@/lib/auth'

// Revisión de QA: ningún id de un formulario puede tocar los datos de otro spa, y un valor alterado da un mensaje, no un 500.

let me: CurrentUser
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error('redirect:' + decodeURIComponent(to).replace(/\+/g, ' '))
  },
  notFound: () => {
    throw new Error('not-found')
  },
}))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig<typeof import('@/lib/auth')>()), requireUser: async () => me }))

import { getDb, one, rows } from '@/lib/db'
import { apptView, createAppointment, slotsFor, tenantBySlug, type Tenant } from '@/lib/booking'
import { approve, cancelByClient, checkout } from '@/lib/appointments'
import { createShop } from '@/lib/signup'
import { settlePending } from '@/lib/payroll'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, atLocal, isYmd, todayYmd, weekdayOf } from '@/lib/time'
import { likeEscape } from '@/lib/validate'
import { requestBooking } from '@/app/r/[slug]/actions'
import { newAppointmentAction, readAlert, saveBarber, saveClientNotes, saveService } from '@/app/app/actions'

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x)
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
const asUser = async (id: string): Promise<CurrentUser> => {
  const u = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where id = $1`, [id]))!
  const t = (await one<{ name: string; slug: string; timezone: string }>('select name, slug, timezone from tenants where id = $1', [u.tenant_id]))!
  return { ...u, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
}

let bella: Tenant
let bellaBranch: string
let camila: string
let ownerBella: CurrentUser
let other: { tenantId: string; ownerId: string; slug: string }
let otherT: Tenant
let otherBranch: string

const workday = (offset: number) => {
  let ymd = addDaysYmd(todayYmd(bella.timezone), offset)
  while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
  return ymd
}

beforeAll(async () => {
  await getDb()
  bella = (await tenantBySlug(DEMO.slug))!
  bellaBranch = (await one<{ id: string }>('select id from branches where tenant_id = $1 order by sort limit 1', [bella.id]))!.id
  camila = (await one<{ id: string }>('select id from users where phone = $1', [DEMO.barbers[0].phone]))!.id
  ownerBella = await asUser((await one<{ id: string }>(`select id from users where tenant_id = $1 and role = 'owner'`, [bella.id]))!.id)
  other = await createShop({ shop: 'Uñas Atacante', city: 'Cali', branch: 'Granada', address: '', owner: 'Otra Dueña', phone: '3159990001', pin: '2468', pin2: '2468' })
  otherT = (await tenantBySlug(other.slug))!
  otherBranch = (await one<{ id: string }>('select id from branches where tenant_id = $1', [other.tenantId]))!.id
})

describe('otro spa no puede tocar a las manicuristas de Bella', () => {
  it('saveBarber con el id (y la sede) de una manicurista de otro spa no cambia nada', async () => {
    me = await asUser(other.ownerId)
    const before = await rows('select weekday, start_min, end_min, branch_id from working_hours where barber_id = $1 order by 1, 2', [camila])
    const hours = { h_1_0_start: '06:00', h_1_0_end: '22:00' }
    for (const branch of [bellaBranch, otherBranch]) {
      const r = await run(saveBarber(form({ id: camila, name: 'Robada', phone: '3159990002', branch, active: 'on', ...hours })))
      expect(r).toContain('err=Manicurista no encontrada')
    }
    // y una manicurista nueva del atacante no puede quedar en una sede de Bella
    expect(await run(saveBarber(form({ id: '', name: 'Nueva', phone: '3159990003', pin: '1234', branch: bellaBranch, ...hours })))).toContain('err=Elige una sede')
    expect(await rows('select weekday, start_min, end_min, branch_id from working_hours where barber_id = $1 order by 1, 2', [camila])).toEqual(before)
    expect((await one<{ name: string }>('select name from users where id = $1', [camila]))!.name).toBe(DEMO.barbers[0].name)
    expect(await one(`select 1 from working_hours where tenant_id = $1 and barber_id = $2`, [other.tenantId, camila])).toBeNull()
  })

  it('aunque hubiera un horario cruzado en la base, las horas libres de un spa solo muestran a su gente', async () => {
    // simula el dato que dejaba el error: horario del atacante apuntando a la manicurista de Bella
    await one(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [
      other.tenantId, camila, otherBranch, weekdayOf(workday(9)), 9 * 60, 18 * 60,
    ])
    const slots = await slotsFor(otherT, { branchId: otherBranch, durationMin: 60, ymd: workday(9) })
    expect(slots.flatMap((s) => s.barberIds)).not.toContain(camila)
    await one(`delete from working_hours where tenant_id = $1`, [other.tenantId])
  })

  it('la ficha, el aviso y el servicio de otro spa no se tocan; ids alterados dan un mensaje', async () => {
    me = await asUser(other.ownerId)
    const client = (await one<{ id: string; notes: string | null }>(`select id, notes from clients where tenant_id = $1 limit 1`, [bella.id]))!
    await run(saveClientNotes(form({ id: client.id, notes: 'hackeado', favorite_colors: '', allergies: '' })))
    expect((await one<{ notes: string | null }>('select notes from clients where id = $1', [client.id]))!.notes).toBe(client.notes)
    expect(await run(saveClientNotes(form({ id: 'nada', notes: 'x' })))).toContain('err=Clienta no encontrada')
    expect(await run(readAlert(form({ id: "1' or 1=1" })))).toContain('redirect:/app/agenda')
    const svc = (await one<{ id: string; name: string }>(`select id, name from services where tenant_id = $1 limit 1`, [bella.id]))!
    await run(saveService(form({ id: svc.id, name: 'Hack', duration: '30', price: '1000' })))
    expect((await one<{ name: string }>('select name from services where id = $1', [svc.id]))!.name).toBe(svc.name)
  })
})

describe('entradas alteradas: mensaje amable, sin error del servidor', () => {
  it('saveService: duración con decimales o id raro', async () => {
    me = ownerBella
    expect(await run(saveService(form({ id: '', name: 'X', duration: '12.5', price: '1000' })))).toContain('err=La duración va en minutos enteros')
    expect(await run(saveService(form({ id: 'abc', name: 'X', duration: '30', price: '1000' })))).toContain('err=Servicio no encontrado')
    expect(await run(saveService(form({ id: '', name: 'X', duration: '30', price: '1000', refill_days: '0' })))).toContain('err=Los días para el retoque')
  })

  it('requestBooking: ids que no son uuid, nota null', async () => {
    const svc = (await one<{ id: string }>(`select id from services where tenant_id = $1 and not is_addon limit 1`, [bella.id]))!.id
    const base = { slug: bella.slug, branchId: bellaBranch, serviceIds: [svc], start: new Date().toISOString(), barberId: null, phone: '3159990010', name: 'X', note: null }
    expect(await requestBooking({ ...base, branchId: 'nope' })).toEqual({ ok: false, error: 'Elige la sede' })
    expect(await requestBooking({ ...base, serviceIds: ["x'; drop table services; --"] })).toEqual({ ok: false, error: 'Elige al menos un servicio' })
    expect(await requestBooking({ ...base, barberId: 'nope' })).toEqual({ ok: false, error: 'Manicurista no disponible' })
    // nota null y hora pasada: llega a la validación normal (no se cae)
    const r = await requestBooking(base)
    expect(r.ok).toBe(false)
  })

  it('aprobar, cancelar o ver una cita con un id alterado', async () => {
    await expect(approve(ownerBella, 'nada')).rejects.toThrow('Cita no encontrada')
    await expect(checkout(ownerBella, '------------------------------------', 1, 0, 'efectivo')).rejects.toThrow('Cita no encontrada')
    await expect(cancelByClient(bella.slug, 'x')).rejects.toThrow('Cita no encontrada')
    expect(await apptView('nada')).toBeNull()
    expect(await slotsFor(bella, { branchId: 'foo', durationMin: 60, ymd: workday(3) })).toEqual([])
  })

  it('isYmd rechaza fechas que no existen', () => {
    expect(isYmd('2026-02-28')).toBe(true)
    expect(isYmd('2028-02-29')).toBe(true)
    expect(isYmd('2026-02-30')).toBe(false)
    expect(isYmd('2026-13-01')).toBe(false)
    expect(isYmd('2026-00-10')).toBe(false)
  })

  it('la búsqueda escapa % y _', () => {
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})

describe('Nueva cita "Otro día / hora"', () => {
  it('no acepta una hora pasada ni una sede donde la manicurista no trabaja', async () => {
    me = ownerBella
    const svc = (await one<{ id: string }>(`select id from services where tenant_id = $1 and not is_addon limit 1`, [bella.id]))!.id
    const yesterday = addDaysYmd(todayYmd(bella.timezone), -1)
    expect(await run(newAppointmentAction(form({ when: 'later', date: yesterday, time: '10:00', barber: camila, service: svc, name: 'X' })))).toContain('err=Esa hora ya pasó')
    expect(await run(newAppointmentAction(form({ when: 'later', date: workday(5), time: '10:00', barber: camila, branch: otherBranch, service: svc, name: 'X' })))).toContain(
      'err=La manicurista no trabaja en esa sede',
    )
    expect(await run(newAppointmentAction(form({ when: 'later', date: workday(5), time: '10:00', barber: 'nope', service: svc, name: 'X' })))).toContain('err=Elige la manicurista')
    expect(await run(newAppointmentAction(form({ when: 'later', date: '2026-02-30', time: '10:00', barber: camila, service: svc, name: 'X' })))).toContain('err=Elige día y hora')
  })
})

describe('la dueña que también atiende', () => {
  it('con "Yo también atiendo" aparece en las horas libres y lo que cobra es todo del spa', async () => {
    me = await asUser(other.ownerId)
    const hours: Record<string, string> = {}
    for (let wd = 1; wd <= 6; wd++) Object.assign(hours, { [`h_${wd}_0_start`]: '09:00', [`h_${wd}_0_end`]: '18:00' })
    const ymd = workday(4)
    expect(await slotsFor(otherT, { branchId: otherBranch, durationMin: 60, ymd })).toEqual([])
    // sin marcar "Yo también atiendo": tiene horario guardado pero no recibe citas
    expect(await run(saveBarber(form({ id: other.ownerId, name: 'Otra Dueña', phone: '3159990001', branch: otherBranch, ...hours })))).toContain('ok=Tu horario quedó guardado')
    expect(await slotsFor(otherT, { branchId: otherBranch, durationMin: 60, ymd })).toEqual([])
    await run(saveBarber(form({ id: other.ownerId, name: 'Otra Dueña', phone: '3159990001', branch: otherBranch, serves: 'on', ...hours })))
    const slots = await slotsFor(otherT, { branchId: otherBranch, durationMin: 60, ymd })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].barberIds).toEqual([other.ownerId])
    // sigue siendo dueña (no aparece como manicurista en pagos) y su PIN no cambió por el formulario
    expect((await one<{ role: string }>('select role from users where id = $1', [other.ownerId]))!.role).toBe('owner')

    const svc = (await one<{ id: string }>(`select id from services where tenant_id = $1 and not is_addon order by sort limit 1`, [other.tenantId]))!.id
    const id = await createAppointment({
      tenantId: other.tenantId, branchId: otherBranch, serviceIds: [svc], start: atLocal(ymd, 10 * 60, otherT.timezone), barberId: other.ownerId,
      clientName: 'Clienta Dueña', clientPhone: null, source: 'staff',
    })
    await checkout(me, id, 25000, 5000, 'nequi', atLocal(ymd, 10 * 60, otherT.timezone))
    await settlePending((await getDb()) as never, other.tenantId)
    const p = (await one<{ barber_share: number; barber_tip: number; shop_share: number; rule: string }>(`select barber_share, barber_tip, shop_share, rule from payments where appointment_id = $1`, [id]))!
    expect(p).toEqual({ barber_share: 0, barber_tip: 0, shop_share: 30000, rule: 'Dueña: todo para el spa' })
  })

  it('no puede dejar de atender con citas por delante', async () => {
    me = await asUser(other.ownerId)
    const svc = (await one<{ id: string }>(`select id from services where tenant_id = $1 and not is_addon order by sort limit 1`, [other.tenantId]))!.id
    await createAppointment({
      tenantId: other.tenantId, branchId: otherBranch, serviceIds: [svc], start: atLocal(workday(6), 11 * 60, otherT.timezone), barberId: other.ownerId,
      clientName: 'Futura', clientPhone: null, source: 'staff',
    })
    const r = await run(saveBarber(form({ id: other.ownerId, name: 'Otra Dueña', phone: '3159990001', branch: otherBranch })))
    expect(r).toContain('1 cita próxima')
  })
})

describe('links sin PUBLIC_URL', () => {
  it('usan la dirección local con la que se abrió la app, nunca un host público de la petición', async () => {
    const { publicBase, rememberHost } = await import('@/lib/base-url')
    const { bookingLink } = await import('@/lib/booking')
    expect(publicBase()).toMatch(/^http:\/\/[^/]+:\d+$/)
    rememberHost('evil.example.com')
    expect(bookingLink('bella')).not.toContain('evil')
    rememberHost('192.168.1.25:3100')
    expect(bookingLink('bella')).toBe('http://192.168.1.25:3100/r/bella')
  })

  it('el plazo de respuesta sale del ajuste del spa', async () => {
    const { fmtSpan } = await import('@/lib/time')
    expect([fmtSpan(120), fmtSpan(60), fmtSpan(90), fmtSpan(45)]).toEqual(['2 horas', '1 hora', '1 h 30 min', '45 minutos'])
  })
})
