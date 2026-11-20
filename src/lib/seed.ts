import { randomUUID } from 'node:crypto'
import type { PGlite, Transaction } from '@electric-sql/pglite'
import { computeShare, type Scheme, type ShopRules } from './commission'
import { hashPin, verifyPin } from './pin'
import { addDaysYmd, atLocal, fmtYmdShort, localParts, todayYmd, weekdayOf } from './time'

/**
 * Datos de ejemplo para probar en local: la barbería "Navaja & Co." (Bogotá, 2 sedes).
 * Se crean solo si la base está vacía. Para empezar de cero: `npm run reset`.
 */
export const DEMO = {
  slug: 'jpbarbar',
  oldSlug: 'navaja', // el link de antes sigue funcionando
  // Entrada común de la demo: celular 1111 + PIN 1111 sirve para todos los usuarios de JP Barbar.
  // Por "Dueño" entra el dueño; por "Barbero" se elige con cuál barbero entrar. (Un equipo real entra con su celular.)
  login: { phone: '1111', pin: '1111' },
  // cada uno también tiene su código corto propio, con el mismo PIN
  owner: { name: 'Laura Gómez', phone: '3000', pin: '1111' },
  barbers: [
    { name: 'Andrés Rojas', phone: '4000', pin: '1111', branch: 0 },
    { name: 'Camilo Díaz', phone: '5000', pin: '1111', branch: 0 },
    { name: 'Julián Mora', phone: '6000', pin: '1111', branch: 0 },
    { name: 'Mateo Ríos', phone: '7000', pin: '1111', branch: 0 },
  ],
}

/** ¿Funciona la entrada común 1111 / 1111 de la demo? Sí, salvo con DEMO_LOGIN=0. */
export function demoLoginEnabled() {
  return process.env.DEMO_LOGIN !== '0'
}

/**
 * ¿Mostrar los usuarios de prueba en la página de inicio? En el computador sí; en internet (Railway) no,
 * porque cualquiera podría entrar como dueño. SHOW_DEMO_LOGINS=1 / 0 lo fuerza.
 */
export function showDemoLogins() {
  const v = process.env.SHOW_DEMO_LOGINS
  if (v === '1' || v === '0') return v === '1'
  return !process.env.RAILWAY_ENVIRONMENT
}

/** Demos creadas antes con celulares largos de prueba: pasan a los códigos cortos (mismo orden). */
const OLD_DEMO_PHONES = ['3000000000', '3001111111', '3002222222', '3003333333', '3004444444']
export async function upgradeDemoLogins(db: PGlite) {
  const people = [DEMO.owner, ...DEMO.barbers]
  const { rows } = await db.query<{ id: string; phone: string }>(
    `select u.id, u.phone from users u join tenants t on t.id = u.tenant_id where t.slug = $1 and u.phone in ($2, $3, $4, $5, $6)`,
    [DEMO.slug, ...OLD_DEMO_PHONES],
  )
  for (const u of rows) {
    const who = people[OLD_DEMO_PHONES.indexOf(u.phone)]
    await db.query('update users set phone = $2, pin_hash = $3 where id = $1', [u.id, who.phone, hashPin(who.pin)])
  }
  // el PIN de prueba pasó de 1234 a 1111 (solo a quien todavía tiene 1234: si alguien lo cambió, se respeta)
  const short = await db.query<{ id: string; pin_hash: string }>(
    `select u.id, u.pin_hash from users u join tenants t on t.id = u.tenant_id where t.slug = $1 and u.phone = any($2)`,
    [DEMO.slug, people.map((p) => p.phone)],
  )
  for (const u of short.rows)
    if (verifyPin('1234', u.pin_hash)) await db.query('update users set pin_hash = $2 where id = $1', [u.id, hashPin(DEMO.login.pin)])
}

const TZ = 'America/Bogota'
/** Días de historial de ejemplo (unos 6 meses, para que las gráficas por mes tengan datos). */
const HISTORY_DAYS = 180

const NAMED_CLIENTS = [
  ['Santiago Pérez', '3104827719'], ['Juan David Herrera', '3156021834'], ['Sebastián Castro', '3007714520'],
  ['Felipe Ramírez', '3209938471'], ['Daniel Ortiz', '3125550198'], ['Alejandro Vargas', '3013348862'],
  ['Nicolás Torres', '3178842210'], ['Samuel Moreno', '3146670035'], ['Tomás Jiménez', '3052219987'],
  ['Mateo Quintero', '3187763341'], ['David Restrepo', '3114402958'], ['Martín Cárdenas', '3229081146'],
  ['Emilio Salazar', '3165530712'], ['Gabriel Rincón', '3023396604'],
]
const FIRST = ['Santiago', 'Juan David', 'Sebastián', 'Felipe', 'Daniel', 'Alejandro', 'Nicolás', 'Samuel', 'Tomás', 'David', 'Martín', 'Emilio', 'Gabriel', 'Carlos', 'Jorge', 'Luis Miguel', 'Óscar', 'Ricardo', 'Esteban', 'Cristian', 'Diego', 'Kevin', 'Brayan', 'Simón', 'Jerónimo', 'Miguel Ángel', 'Juan Pablo', 'Andrés Felipe', 'Iván', 'Manuel']
const LAST = ['Pérez', 'Herrera', 'Castro', 'Ramírez', 'Ortiz', 'Vargas', 'Torres', 'Moreno', 'Jiménez', 'Quintero', 'Restrepo', 'Cárdenas', 'Salazar', 'Rincón', 'López', 'Martínez', 'Rodríguez', 'García', 'Sánchez', 'Muñoz', 'Arias', 'Ospina', 'Valencia', 'Mejía', 'Londoño', 'Zapata', 'Giraldo', 'Cortés', 'Patiño', 'Suárez']
const PHONE_PREFIX = ['300', '301', '302', '304', '305', '310', '311', '312', '313', '314', '315', '316', '318', '320', '321', '322', '323', '350', '351']

/** Qué tan llena suele estar la agenda: viernes y sábados más, lunes y martes menos; la tarde temprano es floja. */
const DAY_FACTOR = [0, 0.8, 0.85, 0.95, 1, 1.25, 1.45] // dom … sáb
const hourFactor = (m: number) => (m < 11 * 60 ? 0.9 : m < 13 * 60 ? 1 : m < 16 * 60 ? 0.75 : m < 18 * 60 ? 1.05 : 1.3)

/** Inserta muchas filas en pocas consultas. */
async function insertMany(tx: Transaction, table: string, cols: string[], data: unknown[][], chunk = 400) {
  for (let i = 0; i < data.length; i += chunk) {
    const params: unknown[] = []
    const values = data
      .slice(i, i + chunk)
      .map((row) => `(${row.map((v) => `$${params.push(v)}`).join(',')})`)
      .join(',')
    await tx.query(`insert into ${table} (${cols.join(',')}) values ${values}`, params)
  }
}

export async function seedIfEmpty(db: PGlite) {
  const { rows } = await db.query<{ n: number }>('select count(*)::int n from tenants')
  if (rows[0].n > 0) return
  await db.transaction(async (tx) => {
    const q = async <T = { id: string }>(sql: string, p: unknown[] = []) => (await tx.query<T>(sql, p)).rows
    const [t] = await q(`insert into tenants (slug, name, city, timezone) values ($1, 'JP Barbar', 'Medellín', $2) returning id`, [DEMO.slug, TZ])
    // Por ahora una sola sede (el sistema admite varias: se agregan en Ajustes)
    const branches = [(await q(`insert into branches (tenant_id, name, address, phone, sort) values ($1, 'Villa Hermosa', 'Cra. 42 #58-25', '6045550101', 0) returning id`, [t.id]))[0]]
    const [owner] = await q(`insert into users (tenant_id, role, name, phone, pin_hash) values ($1, 'owner', $2, $3, $4) returning id`, [t.id, DEMO.owner.name, DEMO.owner.phone, hashPin(DEMO.owner.pin)])
    const barbers: { id: string; branch: string; close: number }[] = []
    for (const b of DEMO.barbers) {
      const branch = branches[b.branch].id
      const [u] = await q(`insert into users (tenant_id, role, name, phone, pin_hash, branch_id) values ($1, 'barber', $2, $3, $4, $5) returning id`, [t.id, b.name, b.phone, hashPin(b.pin), branch])
      const close = 20 * 60
      for (let wd = 1; wd <= 6; wd++) {
        const end = wd === 6 ? 18 * 60 : close
        await q(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [t.id, u.id, branch, wd, 9 * 60, 13 * 60])
        await q(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [t.id, u.id, branch, wd, 14 * 60, end])
      }
      barbers.push({ id: u.id, branch, close })
    }
    const svcDefs: [string, string, number, number][] = [
      ['Corte clásico', 'Tijera o máquina', 40, 30000],
      ['Corte + barba', 'Incluye toalla caliente', 60, 45000],
      ['Barba', 'Perfilado y navaja', 30, 20000],
      ['Cejas', '', 15, 10000],
      ['Corte niño', 'Hasta 12 años', 30, 25000],
    ]
    const services: { id: string; dur: number; price: number }[] = []
    for (const [i, [name, desc, dur, price]] of svcDefs.entries()) {
      const [s] = await q(`insert into services (tenant_id, name, description, duration_min, price, sort) values ($1,$2,$3,$4,$5,$6) returning id`, [t.id, name, desc || null, dur, price, i])
      services.push({ id: s.id, dur, price })
    }

    // ---------- clientes: unos 40 de antes, y van llegando nuevos; cada uno suele volver con su barbero ----------
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
    const now = new Date()
    const today = todayYmd(TZ, now)
    const nowMin = localParts(now, TZ).minutes
    const start0 = atLocal(addDaysYmd(today, -HISTORY_DAYS), 9 * 60, TZ)

    const clientRows: unknown[][] = []
    const usedPhones = new Set([DEMO.owner.phone, ...DEMO.barbers.map((b) => b.phone)])
    const usedNames = new Set([DEMO.owner.name, ...DEMO.barbers.map((b) => b.name)])
    const byBarber: string[][] = barbers.map(() => [])
    const addClient = (name: string, phone: string, created: Date, barber: number) => {
      const id = randomUUID()
      usedPhones.add(phone)
      usedNames.add(name)
      clientRows.push([id, t.id, name, phone, created])
      byBarber[barber].push(id)
      return id
    }
    const newPhone = () => {
      let p: string
      do p = pick(PHONE_PREFIX) + String(Math.floor(rnd() * 1e7)).padStart(7, '0')
      while (usedPhones.has(p))
      return p
    }
    const newName = () => {
      let n: string
      do n = `${pick(FIRST)} ${pick(LAST)}`
      while (usedNames.has(n))
      return n
    }
    const before = (days: number) => new Date(start0.getTime() - days * 864e5)
    const named = NAMED_CLIENTS.map(([name, phone], i) => addClient(name, phone, before(30 + Math.floor(rnd() * 200)), i % barbers.length))
    for (let i = 0; i < 26; i++) addClient(newName(), newPhone(), before(10 + Math.floor(rnd() * 300)), i % barbers.length)
    const santiago = named[0] // cliente fijo de Andrés, con notas
    const allClients = () => byBarber.flat()

    // ---------- esquemas de pago (fase 2): cada barbero distinto ----------
    const mondayOf = (ymd: string) => addDaysYmd(ymd, -((weekdayOf(ymd) + 6) % 7))
    const firstMonday = mondayOf(addDaysYmd(today, -HISTORY_DAYS))
    await q(`update tenants set ledger_start = $2 where id = $1`, [t.id, atLocal(firstMonday, 0, TZ)]) // la cuenta de los barberos arranca con el historial
    const shop: ShopRules = { defaultPct: 45, tipsToBarber: true, deductCardFee: false, cardFeePct: 3 } // = valores por defecto de la tabla tenants
    const schemes: (Scheme | null)[] = [
      // Andrés: 50%, Corte + barba al 55% y Cejas $5.000 fijo
      { model: 'percent', percent: 50, rentAmount: null, rentPeriod: null, rates: { [services[1].id]: { kind: 'percent', value: 55 }, [services[3].id]: { kind: 'fixed', value: 5000 } } },
      null, // Camilo: la comisión por defecto de la barbería
      // Julián: 45%, Barba $10.000 fijo
      { model: 'percent', percent: 45, rentAmount: null, rentPeriod: null, rates: { [services[2].id]: { kind: 'fixed', value: 10000 } } },
      // Mateo: arriendo de silla semanal
      { model: 'rent', percent: null, rentAmount: 350000, rentPeriod: 'weekly', rentSince: firstMonday, rates: {} },
    ]
    for (const [bi, sc] of schemes.entries()) {
      if (!sc) continue
      await q(`insert into barber_pay (barber_id, tenant_id, model, percent, rent_amount, rent_period, rent_since) values ($1,$2,$3,$4,$5,$6,$7)`, [
        barbers[bi].id,
        t.id,
        sc.model,
        sc.percent,
        sc.rentAmount,
        sc.rentPeriod,
        sc.rentSince ?? null,
      ])
      for (const [sid, r] of Object.entries(sc.rates))
        await q(`insert into barber_service_rates (barber_id, service_id, tenant_id, kind, value) values ($1,$2,$3,$4,$5)`, [barbers[bi].id, sid, t.id, r.kind, r.value])
    }
    const weekEarn = barbers.map(() => new Map<string, number>()) // lo que ganó cada barbero por semana (lunes)

    // ---------- historial: HISTORY_DAYS hacia atrás + hoy + 3 días adelante ----------
    const methods = ['efectivo', 'efectivo', 'efectivo', 'nequi', 'nequi', 'tarjeta', 'daviplata']
    const apptRows: unknown[][] = []
    const payRows: unknown[][] = []
    for (let d = -HISTORY_DAYS; d <= 3; d++) {
      const ymd = addDaysYmd(today, d)
      const wd = weekdayOf(ymd)
      if (wd === 0) continue
      const growth = 0.85 + (0.15 * (d + HISTORY_DAYS)) / HISTORY_DAYS // la barbería va creciendo
      barbers.forEach((b, bi) => {
        const end = wd === 6 ? 18 * 60 : b.close
        for (let m = 9 * 60; m + 60 <= end; m += 60) {
          if (m >= 13 * 60 && m < 14 * 60) continue
          const svc = rnd() < 0.45 ? services[1] : pick(services)
          // lo que aún no termina (o es más tarde) queda confirmado; lo que ya terminó se cobró
          const future = d > 0 || (d === 0 && m + svc.dur > nowMin)
          let p = Math.min(0.95, 0.62 * growth * DAY_FACTOR[wd] * hourFactor(m))
          if (future) p *= d === 0 ? 0.75 : 0.55
          if (rnd() > p) continue
          const start = atLocal(ymd, m, TZ)
          const endAt = new Date(start.getTime() + svc.dur * 60_000)
          const created = new Date(start.getTime() - (1 + Math.floor(rnd() * 4)) * 864e5)
          let client: string
          if (bi === 0 && rnd() < 0.018) client = santiago
          else if (rnd() < 0.09) client = addClient(newName(), newPhone(), created, bi)
          else client = rnd() < 0.85 ? pick(byBarber[bi]) : pick(allClients())
          let status = 'completed'
          if (future) status = 'confirmed'
          else {
            const r = rnd()
            if (r < 0.06) status = 'no_show'
            else if (r < 0.11) status = 'cancelled'
          }
          const id = randomUUID()
          apptRows.push([id, t.id, b.branch, b.id, client, svc.id, start, endAt, status, rnd() < 0.7 ? 'online' : 'walkin', svc.price, created, created])
          if (status === 'completed') {
            const tip = rnd() < 0.35 ? pick([2000, 5000, 5000, 10000]) : 0
            const method = pick(methods)
            const sh = computeShare({ amount: svc.price, tip, method, serviceId: svc.id }, schemes[bi], shop)
            payRows.push([t.id, id, b.branch, b.id, client, svc.id, svc.price, tip, method, endAt, sh.barberShare, sh.barberTip, sh.shopShare, sh.rule])
            const wk = mondayOf(ymd)
            weekEarn[bi].set(wk, (weekEarn[bi].get(wk) ?? 0) + sh.barberShare + sh.barberTip)
          }
        }
      })
    }
    await insertMany(tx, 'clients', ['id', 'tenant_id', 'name', 'phone', 'created_at'], clientRows)
    await insertMany(tx, 'appointments', ['id', 'tenant_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'starts_at', 'ends_at', 'status', 'source', 'price', 'created_at', 'decided_at'], apptRows)
    await insertMany(
      tx,
      'payments',
      ['tenant_id', 'appointment_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'amount', 'tip', 'method', 'paid_at', 'barber_share', 'barber_tip', 'shop_share', 'rule'],
      payRows,
    )
    await q(`update clients set notes = 'Le gusta degradado bajo, tijera arriba. Prefiere café sin azúcar.' where id = $1`, [santiago])

    // ---------- pagos a los barberos ----------
    // Cada lunes la dueña les paga lo de la semana anterior; a veces un adelanto el miércoles.
    // Mateo paga el arriendo cada lunes; el de esta semana todavía no. Camilo pidió un adelanto esta semana.
    const thisMonday = mondayOf(today)
    const short = (ymd: string) => `${fmtYmdShort(ymd).day} ${fmtYmdShort(ymd).mo}`
    const payoutRows: unknown[][] = []
    for (let w = firstMonday; w <= thisMonday; w = addDaysYmd(w, 7)) {
      const wed = addDaysYmd(w, 2)
      const nextMon = addDaysYmd(w, 7)
      schemes.forEach((sc, bi) => {
        const b = barbers[bi]
        if (sc?.model === 'rent') {
          if (w < thisMonday) payoutRows.push([t.id, b.id, 'arriendo', sc.rentAmount, pick(['efectivo', 'nequi']), w, `Semana del ${short(w)}`, owner.id])
          return
        }
        const earned = weekEarn[bi].get(w) ?? 0
        let advance = 0
        const asked = bi === 1 && w === thisMonday
        if (wed <= today && (asked || rnd() < 0.15)) {
          advance = asked ? 100000 : pick([50000, 100000])
          payoutRows.push([t.id, b.id, 'adelanto', advance, pick(['efectivo', 'nequi']), wed, null, owner.id])
        }
        if (nextMon <= today && earned - advance > 0)
          payoutRows.push([t.id, b.id, 'pago', earned - advance, pick(['efectivo', 'efectivo', 'nequi', 'transferencia']), nextMon, `Semana ${short(w)} – ${short(addDaysYmd(w, 6))}`, owner.id])
      })
    }
    await insertMany(tx, 'barber_payouts', ['tenant_id', 'barber_id', 'kind', 'amount', 'method', 'paid_on', 'note', 'created_by'], payoutRows)

    // Dos solicitudes pendientes para Andrés: una recién llegada y otra que ya venció (el dueño recibe aviso).
    const andres = barbers[0]
    const tomorrow = addDaysYmd(today, weekdayOf(addDaysYmd(today, 1)) === 0 ? 2 : 1)
    const mk = async (ymd: string, min: number, client: string, createdAgoMin: number, windowMin: number) => {
      const start = atLocal(ymd, min, TZ)
      const svc = services[1]
      const clash = await q(`select id from appointments where barber_id = $1 and status in ('pending','confirmed') and starts_at < $3 and ends_at > $2`, [andres.id, start, new Date(start.getTime() + svc.dur * 60_000)])
      for (const c of clash) await q(`delete from appointments where id = $1`, [c.id])
      const created = new Date(now.getTime() - createdAgoMin * 60_000)
      await q(
        `insert into appointments (tenant_id, branch_id, barber_id, client_id, service_id, starts_at, ends_at, status, source, price, created_at, approval_deadline, client_note)
         values ($1,$2,$3,$4,$5,$6,$7,'pending','online',$8,$9,$10,$11)`,
        [t.id, andres.branch, andres.id, client, svc.id, start, new Date(start.getTime() + svc.dur * 60_000), svc.price, created, new Date(created.getTime() + windowMin * 60_000), createdAgoMin < 60 ? 'Igual que la última vez' : null],
      )
    }
    await mk(tomorrow, 10 * 60 + 30, santiago, 25, 120)
    await mk(tomorrow, 16 * 60, named[4], 150, 120)
  })
}
