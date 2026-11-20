import { beforeAll, describe, expect, it } from 'vitest'
import { getDb, one, rows } from '@/lib/db'
import { topUpDemo } from '@/lib/demo-fill'
import { addDaysYmd, atLocal, todayYmd } from '@/lib/time'

const TZ = 'America/Bogota'

describe('la demo se mantiene viva', () => {
  beforeAll(async () => {
    await getDb() // siembra + primer llenado
  })

  it('al arrancar ya hay citas para las próximas dos semanas', async () => {
    const r = await rows<{ d: string }>(
      `select distinct to_char(starts_at at time zone $1, 'YYYY-MM-DD') d from appointments where starts_at > now() and status = 'confirmed'`,
      [TZ],
    )
    expect(r.length).toBeGreaterThanOrEqual(10)
  })

  it('cinco días después: llena los días vacíos, cobra lo que pasó y paga el lunes', async () => {
    const db = await getDb()
    const later = new Date(Date.now() + 5 * 864e5)
    const payoutsBefore = (await one<{ n: number }>('select count(*)::int n from barber_payouts'))!.n
    const r = (await topUpDemo(db, later))!
    expect(r.appointments).toBeGreaterThan(0)
    // nada confirmado ni pendiente en el pasado (respecto al "ahora" simulado)
    const stale = await one<{ n: number }>(
      `select count(*)::int n from appointments where (status = 'confirmed' and ends_at < $1::timestamptz - interval '1 hour') or (status = 'pending' and starts_at < $1)`,
      [later],
    )
    expect(stale!.n).toBe(0)
    // todo lo atendido tiene su pago repartido
    const unpaid = await one<{ n: number }>(`select count(*)::int n from appointments a where status = 'completed' and not exists (select 1 from payments p where p.appointment_id = a.id)`)
    expect(unpaid!.n).toBe(0)
    expect((await one<{ n: number }>('select count(*)::int n from payments where barber_share is null'))!.n).toBe(0)
    // ningún día de trabajo vacío entre hoy y el "ahora" simulado + 2 semanas
    const today = todayYmd(TZ)
    const end = addDaysYmd(todayYmd(TZ, later), 14)
    const days = new Set(
      (await rows<{ d: string }>(`select distinct to_char(starts_at at time zone $1, 'YYYY-MM-DD') d from appointments where starts_at >= $2`, [TZ, atLocal(today, 0, TZ)])).map((x) => x.d),
    )
    for (let d = today; d <= end; d = addDaysYmd(d, 1)) if (new Date(d + 'T12:00:00Z').getUTCDay() !== 0) expect(days.has(d), d).toBe(true)
    // siempre hay solicitudes para confirmar
    expect((await one<{ n: number }>(`select count(*)::int n from appointments where status = 'pending' and starts_at > $1`, [later]))!.n).toBeGreaterThanOrEqual(2)
    // si pasó un lunes, hay pagos nuevos
    const passedMonday = [1, 2, 3, 4, 5].some((i) => new Date(Date.now() + i * 864e5).getUTCDay() === 1)
    if (passedMonday) expect((await one<{ n: number }>('select count(*)::int n from barber_payouts'))!.n).toBeGreaterThan(payoutsBefore)
  })

  it('correrlo otra vez no duplica nada', async () => {
    const db = await getDb()
    const later = new Date(Date.now() + 5 * 864e5)
    const before = (await one<{ n: number }>('select count(*)::int n from appointments'))!.n
    const r = (await topUpDemo(db, later))!
    expect(r.appointments).toBe(0)
    expect(r.payouts).toBe(0)
    expect((await one<{ n: number }>('select count(*)::int n from appointments'))!.n).toBe(before)
  })
})

describe('día con pocas citas', () => {
  it('se completa sin cruzarse con lo que ya hay', async () => {
    const db = await getDb()
    const later = new Date(Date.now() + 5 * 864e5)
    const day = addDaysYmd(todayYmd(TZ, later), 3)
    // dejar ese día con una sola cita (como si alguien hubiera probado la demo)
    const keep = (await one<{ id: string }>(`select id from appointments where to_char(starts_at at time zone $1, 'YYYY-MM-DD') = $2 order by starts_at limit 1`, [TZ, day]))!.id
    await db.query(`delete from appointments where to_char(starts_at at time zone $1, 'YYYY-MM-DD') = $2 and id <> $3`, [TZ, day, keep])
    await topUpDemo(db, later)
    const n = (await one<{ n: number }>(`select count(*)::int n from appointments where to_char(starts_at at time zone $1, 'YYYY-MM-DD') = $2`, [TZ, day]))!.n
    expect(n).toBeGreaterThan(4)
    const clash = await one<{ n: number }>(
      `select count(*)::int n from appointments a join appointments b on a.barber_id = b.barber_id and a.id < b.id
        and a.starts_at < b.ends_at and b.starts_at < a.ends_at
        where a.status in ('pending','confirmed','completed') and b.status in ('pending','confirmed','completed')
          and to_char(a.starts_at at time zone $1, 'YYYY-MM-DD') = $2`,
      [TZ, day],
    )
    expect(clash!.n).toBe(0)
  })
})
