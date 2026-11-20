import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))

import { getDb, one, rows } from '@/lib/db'
import { apptView, BookingError, comboTotals, createAppointment, loadServices, slotsFor, tenantBySlug, type Tenant } from '@/lib/booking'
import { checkout, runDueJobs } from '@/lib/appointments'
import { computeShare, splitAmount, type Scheme, type ShopRules } from '@/lib/commission'
import { computeSlots } from '@/lib/availability'
import { requestBooking } from '@/app/r/[slug]/actions'
import type { CurrentUser } from '@/lib/auth'
import { DEMO } from '@/lib/seed'
import { addDaysYmd, atLocal, localParts, todayYmd, weekdayOf } from '@/lib/time'

// Spa de uñas: varios servicios por cita, adicionales, comisión por línea y recordatorio de retoque.

let t: Tenant
let branchId: string
let owner: CurrentUser
let camila: string
const svc: Record<string, { id: string; duration_min: number; price: number }> = {}

const workday = (offset: number) => {
  let ymd = addDaysYmd(todayYmd(t.timezone), offset)
  while (weekdayOf(ymd) === 0) ymd = addDaysYmd(ymd, 1)
  return ymd
}

/** Cobro a la hora de la cita (el cobro solo se habilita 3 h antes de empezar). */
const startOf = async (id: string) => new Date((await one<{ s: Date }>('select starts_at s from appointments where id = $1', [id]))!.s)

beforeAll(async () => {
  await getDb()
  t = (await tenantBySlug(DEMO.slug))!
  branchId = (await one<{ id: string }>(`select id from branches where tenant_id = $1 and active order by sort limit 1`, [t.id]))!.id
  for (const s of await rows<{ id: string; name: string; duration_min: number; price: number }>('select id, name, duration_min, price from services where tenant_id = $1', [t.id]))
    svc[s.name] = s
  const o = (await one<CurrentUser>(`select id, tenant_id, role, name, phone, branch_id from users where phone = $1`, [DEMO.owner.phone]))!
  owner = { ...o, tenant_name: t.name, tenant_slug: t.slug, timezone: t.timezone }
  camila = (await one<{ id: string }>(`select id from users where phone = $1`, [DEMO.barbers[0].phone]))!.id
})

describe('varios servicios en una cita', () => {
  it('duración y precio son la suma; primero los principales y luego los adicionales', async () => {
    const list = await loadServices(t.id, [svc['Nail art (por uña)'].id, svc['Manicure semipermanente'].id, svc['Pedicure spa'].id])
    expect(list.map((s) => s.id)).toEqual([svc['Manicure semipermanente'].id, svc['Pedicure spa'].id, svc['Nail art (por uña)'].id])
    expect(comboTotals(list)).toEqual({ duration: 60 + 90 + 15, price: 45000 + 65000 + 5000 })
  })

  it('un adicional solo no se puede reservar, ni un servicio repetido cuenta dos veces', async () => {
    await expect(loadServices(t.id, [svc['Retiro de semipermanente'].id])).rejects.toThrow('principal')
    const dup = await loadServices(t.id, [svc['Manicure tradicional'].id, svc['Manicure tradicional'].id])
    expect(dup).toHaveLength(1)
    await expect(loadServices(t.id, ['00000000-0000-0000-0000-000000000000'])).rejects.toBeInstanceOf(BookingError)
  })

  it('la disponibilidad usa la duración total: una hora que cabe para un servicio no cabe para dos', () => {
    const tz = 'America/Bogota'
    const ymd = '2026-11-16'
    const base = { ymd, tz, stepMin: 30, minNoticeMin: 60, now: new Date('2026-11-15T12:00:00Z') }
    // libre de 9:00 a 11:00, ocupada después
    const barbers = [{ id: 'a', hours: [{ start_min: 540, end_min: 720 }], busy: [{ start: atLocal(ymd, 660, tz), end: atLocal(ymd, 720, tz) }] }]
    expect(computeSlots({ ...base, durationMin: 60, barbers }).map((s) => s.minutes)).toEqual([540, 570, 600])
    expect(computeSlots({ ...base, durationMin: 60 + 45, barbers }).map((s) => s.minutes)).toEqual([540])
    expect(computeSlots({ ...base, durationMin: 60 + 75, barbers })).toHaveLength(0)
  })

  it('reserva online con dos servicios y un adicional: guarda las líneas, el precio y la hora de fin', async () => {
    const ids = [svc['Manicure semipermanente'].id, svc['Pedicure tradicional'].id, svc['Retiro de semipermanente'].id]
    const ymd = workday(9)
    const slot = (await slotsFor(t, { branchId, durationMin: 135, ymd })).find((s) => s.barberIds.length)!
    const r = await requestBooking({ slug: t.slug, branchId, serviceIds: ids, start: slot.start.toISOString(), barberId: null, phone: '3175550101', name: 'Multi Servicio', note: '' })
    expect(r.ok).toBe(true)
    const a = (await apptView((r as { id: string }).id))!
    expect(a.price).toBe(45000 + 35000 + 8000)
    expect(a.duration_min).toBe(135)
    expect(new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()).toBe(135 * 60_000)
    expect(a.lines.map((l) => l.name)).toEqual(['Manicure semipermanente', 'Pedicure tradicional', 'Retiro de semipermanente'])
    expect(a.lines[2].is_addon).toBe(true)
    expect(a.service_name).toBe('Manicure semipermanente + Pedicure tradicional + Retiro de semipermanente')
    const msg = await one<{ body: string }>(`select body from messages where appointment_id = $1 and template = 'solicitud_recibida'`, [a.id])
    expect(msg!.body).toContain('Manicure semipermanente + Pedicure tradicional')
  })

  it('una cita larga no se cruza con la siguiente de la misma manicurista', async () => {
    const ymd = workday(10)
    const start = atLocal(ymd, 9 * 60, t.timezone)
    await createAppointment({ tenantId: t.id, branchId, serviceIds: [svc['Pedicure spa'].id], start: atLocal(ymd, 10 * 60 + 30, t.timezone), barberId: camila, clientName: 'Ocupa', clientPhone: null, source: 'staff' }).catch(() => null)
    // 9:00 + acrílico (120) termina 11:00 y choca con algo a las 10:30
    await expect(
      createAppointment({ tenantId: t.id, branchId, serviceIds: [svc['Uñas acrílicas'].id], start, barberId: camila, clientName: 'Larga', clientPhone: null, source: 'staff' }),
    ).rejects.toThrow('ya tiene una cita')
  })
})

describe('comisión por línea', () => {
  const shop: ShopRules = { defaultPct: 45, tipsToBarber: true, deductCardFee: false, cardFeePct: 3 }
  const scheme: Scheme = { model: 'percent', percent: 50, rentAmount: null, rentPeriod: null, rates: { acr: { kind: 'percent', value: 55 }, art: { kind: 'fixed', value: 4000 } } }

  it('reparte el valor cobrado entre las líneas según su precio', () => {
    expect(splitAmount(100, [50, 50])).toEqual([50, 50])
    expect(splitAmount(100000, [45000, 35000, 8000])).toEqual([51136, 39773, 9091])
    expect(splitAmount(100000, [45000, 35000, 8000]).reduce((a, b) => a + b, 0)).toBe(100000)
    expect(splitAmount(0, [10, 20])).toEqual([0, 0])
  })

  it('cada servicio usa su regla: % especial, $ fijo y el % general', () => {
    const s = computeShare(
      { amount: 125000, tip: 5000, method: 'nequi', lines: [{ serviceId: 'acr', price: 110000 }, { serviceId: 'art', price: 5000 }, { serviceId: 'ret', price: 10000 }] },
      scheme,
      shop,
    )
    expect(s.lines.map((l) => l.barberShare)).toEqual([60500, 4000, 5000])
    expect(s.barberShare).toBe(69500)
    expect(s.barberTip).toBe(5000)
    expect(s.shopShare).toBe(125000 + 5000 - 69500 - 5000)
    expect(s.rule).toBe('55% (especial) + Fijo $4.000 + 50%')
  })

  it('arriendo de puesto: todo para la manicurista en todas las líneas', () => {
    const rent: Scheme = { model: 'rent', percent: null, rentAmount: 300000, rentPeriod: 'weekly', rates: {} }
    const s = computeShare({ amount: 80000, tip: 0, method: 'efectivo', lines: [{ serviceId: 'a', price: 45000 }, { serviceId: 'b', price: 35000 }] }, rent, shop)
    expect(s).toMatchObject({ barberShare: 80000, shopShare: 0, rule: 'Arriendo de puesto: 100% para la manicurista' })
  })

  it('al cobrar una cita con varios servicios, guarda la parte de cada línea', async () => {
    // Camila: 50% general, Uñas acrílicas 55%, Nail art $4.000 fijo
    const ymd = workday(11)
    const id = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Uñas acrílicas'].id, svc['Nail art (por uña)'].id, svc['Retiro de acrílico o polygel'].id],
      start: atLocal(ymd, 6 * 60, t.timezone), barberId: camila, clientName: 'Líneas', clientPhone: null, source: 'staff',
    })
    await checkout(owner, id, 135000, 0, 'efectivo', await startOf(id))
    const lines = await rows<{ name: string; charged: number; barber_share: number; rule: string }>(
      `select name, charged, barber_share, rule from appointment_services where appointment_id = $1 order by sort`,
      [id],
    )
    expect(lines.map((l) => l.charged)).toEqual([110000, 5000, 20000])
    expect(lines.map((l) => l.barber_share)).toEqual([60500, 4000, 10000])
    const p = (await one<{ barber_share: number; shop_share: number }>(`select barber_share, shop_share from payments where appointment_id = $1`, [id]))!
    expect(p).toEqual({ barber_share: 74500, shop_share: 135000 - 74500 })
  })
})

describe('cobrar: solo desde 3 horas antes', () => {
  it('no deja cobrar una cita de otro día; a 3 h o menos de empezar, sí', async () => {
    const ymd = workday(16)
    const start = atLocal(ymd, 6 * 60, t.timezone)
    const id = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Manicure tradicional'].id], start, barberId: camila, clientName: 'Cobro Temprano', clientPhone: null, source: 'staff',
    })
    await expect(checkout(owner, id, 30000, 0, 'efectivo')).rejects.toThrow('3 horas antes')
    await expect(checkout(owner, id, 30000, 0, 'efectivo', new Date(start.getTime() - 3 * 3600_000 - 60_000))).rejects.toBeInstanceOf(BookingError)
    expect(await one('select 1 from payments where appointment_id = $1', [id])).toBeNull()
    expect((await one<{ status: string }>('select status from appointments where id = $1', [id]))!.status).toBe('confirmed')
    await checkout(owner, id, 30000, 0, 'efectivo', new Date(start.getTime() - 2 * 3600_000))
    expect((await one<{ status: string }>('select status from appointments where id = $1', [id]))!.status).toBe('completed')
  })
})

describe('recordatorio de retoque', () => {
  it('al cobrar un semipermanente agenda el mensaje para dentro de 15 días y lo envía si la clienta no volvió', async () => {
    const ymd = workday(12)
    const phone = '3175550202'
    const id = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Manicure semipermanente'].id, svc['Pedicure tradicional'].id],
      start: atLocal(ymd, 6 * 60, t.timezone), barberId: camila, clientName: 'Retoque Uno', clientPhone: phone, source: 'staff',
    })
    await checkout(owner, id, 80000, 0, 'nequi', await startOf(id))
    const rem = (await one<{ due_at: Date; service_name: string }>(`select due_at, service_name from refill_reminders where appointment_id = $1`, [id]))!
    expect(rem.service_name).toBe('Manicure semipermanente')
    expect(todayYmd(t.timezone, new Date(rem.due_at))).toBe(addDaysYmd(ymd, 15))

    await runDueJobs(new Date(new Date(rem.due_at).getTime() - 60_000))
    expect(await one(`select 1 from messages where appointment_id = $1 and template = 'retoque'`, [id])).toBeNull()

    await runDueJobs(new Date(new Date(rem.due_at).getTime() + 60_000))
    const msgs = await rows<{ body: string; to_phone: string }>(`select body, to_phone from messages where appointment_id = $1 and template = 'retoque'`, [id])
    expect(msgs).toHaveLength(1)
    expect(msgs[0].to_phone).toBe(phone)
    expect(msgs[0].body).toContain('retoque')
    expect(msgs[0].body).toContain(`/r/${t.slug}`)

    // no se envía dos veces
    await runDueJobs(new Date(new Date(rem.due_at).getTime() + 120_000))
    expect(await rows(`select 1 from messages where appointment_id = $1 and template = 'retoque'`, [id])).toHaveLength(1)
  })

  it('no se envía si la clienta ya tiene otra cita después', async () => {
    const phone = '3175550303'
    const id = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Uñas acrílicas'].id], start: atLocal(workday(13), 6 * 60, t.timezone), barberId: camila,
      clientName: 'Retoque Dos', clientPhone: phone, source: 'staff',
    })
    await checkout(owner, id, 110000, 0, 'efectivo', await startOf(id))
    const rem = (await one<{ id: string; due_at: Date }>(`select id, due_at from refill_reminders where appointment_id = $1`, [id]))!
    // ya reservó el retoque para dentro de un mes
    await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Retoque de acrílico'].id], start: atLocal(workday(40), 6 * 60, t.timezone), barberId: camila,
      clientName: 'Retoque Dos', clientPhone: phone, source: 'staff',
    })
    await runDueJobs(new Date(new Date(rem.due_at).getTime() + 60_000))
    expect(await one(`select 1 from messages where appointment_id = $1 and template = 'retoque'`, [id])).toBeNull()
    expect((await one<{ skipped: boolean }>(`select skipped_at is not null skipped from refill_reminders where id = $1`, [rem.id]))!.skipped).toBe(true)
  })

  it('un servicio sin retoque (pedicure) o una clienta sin celular no agendan nada', async () => {
    const a = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Pedicure spa'].id], start: atLocal(workday(14), 6 * 60, t.timezone), barberId: camila,
      clientName: 'Sin Retoque', clientPhone: '3175550404', source: 'staff',
    })
    await checkout(owner, a, 65000, 0, 'efectivo', await startOf(a))
    expect(await one(`select 1 from refill_reminders where appointment_id = $1`, [a])).toBeNull()
    const b = await createAppointment({
      tenantId: t.id, branchId, serviceIds: [svc['Manicure semipermanente'].id], start: atLocal(workday(15), 6 * 60, t.timezone), barberId: camila,
      clientName: 'De paso', clientPhone: null, source: 'walkin',
    })
    await checkout(owner, b, 45000, 0, 'efectivo', await startOf(b))
    expect(await one(`select 1 from refill_reminders where appointment_id = $1`, [b])).toBeNull()
  })
})

describe('datos de ejemplo', () => {
  it('Spa Uñas Bella: 4 manicuristas, catálogo con adicionales y citas con varios servicios', async () => {
    expect(t.name).toBe('Spa Uñas Bella')
    expect((await one<{ n: number }>(`select count(*)::int n from users where tenant_id = $1 and role = 'barber'`, [t.id]))!.n).toBe(4)
    expect((await one<{ n: number }>(`select count(*)::int n from services where tenant_id = $1 and is_addon`, [t.id]))!.n).toBeGreaterThanOrEqual(4)
    const multi = await one<{ n: number }>(`select count(*)::int n from (select appointment_id from appointment_services where tenant_id = $1 group by 1 having count(*) > 1) x`, [t.id])
    expect(multi!.n).toBeGreaterThan(100)
    // cada cita tiene sus líneas y su precio es la suma
    const bad = await one<{ n: number }>(
      `select count(*)::int n from appointments a where a.tenant_id = $1 and a.price <> coalesce((select sum(price) from appointment_services x where x.appointment_id = a.id), -1)`,
      [t.id],
    )
    expect(bad!.n).toBe(0)
    // la parte de las líneas cobradas suma lo del pago
    const off = await one<{ n: number }>(
      `select count(*)::int n from payments p where p.tenant_id = $1 and p.barber_share <> (select sum(barber_share) from appointment_services x where x.appointment_id = p.appointment_id)`,
      [t.id],
    )
    expect(off!.n).toBe(0)
  })

  it('demo con vida: agenda de las próximas 2 semanas, fichas, propinas, Nequi/Daviplata y avisos', async () => {
    const n = async (sql: string, p: unknown[] = [t.id]) => (await one<{ n: number }>(sql, p))!.n
    // cada día de trabajo de las próximas 2 semanas tiene citas, y hay solicitudes por aprobar y alguna cancelación de la clienta
    const days = await rows<{ d: string; n: number }>(
      `select to_char(starts_at at time zone 'America/Bogota', 'YYYY-MM-DD') d, count(*)::int n from appointments
        where tenant_id = $1 and starts_at > now() + interval '1 day' and starts_at < now() + interval '13 days' and status in ('confirmed', 'pending') group by 1`,
      [t.id],
    )
    expect(days.length).toBeGreaterThanOrEqual(9)
    for (const d of days) expect(d.n, d.d).toBeGreaterThanOrEqual(5)
    expect(await n(`select count(*)::int n from appointments where tenant_id = $1 and status = 'pending' and starts_at > now()`)).toBeGreaterThanOrEqual(3)
    expect(await n(`select count(*)::int n from appointments where tenant_id = $1 and cancel_reason = 'Cancelada por la clienta'`)).toBeGreaterThan(0)
    // fichas: 10–25 % con colores y notas, unas pocas con alergias
    const total = await n(`select count(*)::int n from clients where tenant_id = $1`)
    const colors = await n(`select count(*)::int n from clients where tenant_id = $1 and favorite_colors is not null`)
    expect(colors / total).toBeGreaterThan(0.1)
    expect(colors / total).toBeLessThan(0.25)
    const allergies = await n(`select count(*)::int n from clients where tenant_id = $1 and allergies is not null`)
    expect(allergies).toBeGreaterThanOrEqual(3)
    expect(allergies).toBeLessThanOrEqual(10)
    // propina en buena parte de los cobros; Nequi y Daviplata son más de la mitad
    const pays = await n(`select count(*)::int n from payments where tenant_id = $1`)
    expect((await n(`select count(*)::int n from payments where tenant_id = $1 and tip > 0`)) / pays).toBeGreaterThan(0.4)
    expect((await n(`select count(*)::int n from payments where tenant_id = $1 and method in ('nequi', 'daviplata')`)) / pays).toBeGreaterThan(0.5)
    // viernes con más citas que lunes; historial de retoques y de pagos al equipo; pocos avisos sin leer
    const fri = await n(`select count(*)::int n from appointments where tenant_id = $1 and starts_at < now() and extract(dow from starts_at at time zone 'America/Bogota') = 5`)
    const mon = await n(`select count(*)::int n from appointments where tenant_id = $1 and starts_at < now() and extract(dow from starts_at at time zone 'America/Bogota') = 1`)
    expect(fri).toBeGreaterThan(mon)
    expect(await n(`select count(*)::int n from refill_reminders where tenant_id = $1 and skipped_at is not null`)).toBeGreaterThan(50)
    expect(await n(`select count(*)::int n from barber_payouts where tenant_id = $1`)).toBeGreaterThan(50)
    expect(await n(`select count(*)::int n from alerts where tenant_id = $1 and kind = 'client_cancelled' and read_at is null`)).toBeLessThanOrEqual(6)
    expect(await n(`select count(*)::int n from messages where tenant_id = $1 and appointment_id is null`)).toBe(0)
  })

  it('los retoques que ya tocaban quedan enviados a las 10 a. m. de su día, no a la hora de arranque', async () => {
    const seeded = await rows<{ due_at: Date; sent_at: Date | null; skipped_at: Date | null; msg_at: Date | null; body: string | null }>(
      `select r.due_at, r.sent_at, r.skipped_at, m.created_at msg_at, m.body
         from refill_reminders r join appointments a on a.id = r.appointment_id
         left join messages m on m.appointment_id = r.appointment_id and m.template = 'retoque'
        where r.tenant_id = $1 and a.starts_at < now() and r.due_at <= now()`,
      [t.id],
    )
    expect(seeded.length).toBeGreaterThan(0)
    for (const r of seeded) {
      if (r.skipped_at) continue
      expect(new Date(r.sent_at!).getTime()).toBe(new Date(r.due_at).getTime())
      expect(new Date(r.msg_at!).getTime()).toBe(new Date(r.due_at).getTime())
      expect(localParts(new Date(r.due_at), t.timezone).minutes).toBe(10 * 60)
      expect(r.body).toContain('desde tu última cita (')
    }
  })
})
