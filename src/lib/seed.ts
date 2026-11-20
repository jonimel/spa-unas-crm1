import { randomUUID } from 'node:crypto'
import type { PGlite, Transaction } from '@electric-sql/pglite'
import { computeShare, type Scheme, type ShopRules } from './commission'
import { CLIENT_NOTES, DEMO_CATALOG, DEMO_METHODS, demoTip, FICHA_ALLERGIES, FICHA_COLORS, FICHA_NOTES, futureFactor, pickCombo, seasonFactor } from './demo-catalog'
import { bookingLink } from './booking'
import { firstName } from './phone'
import { hashPin, verifyPin } from './pin'
import { render } from './whatsapp'
import { addDaysYmd, atLocal, fmtDay, fmtTime, fmtYmdShort, localParts, todayYmd, weekdayOf } from './time'

/**
 * Datos de ejemplo para probar en local: el spa de uñas "Spa Uñas Bella" (Medellín, una sede).
 * Se crean solo si la base está vacía. Para empezar de cero: `npm run reset`.
 */
export const DEMO = {
  slug: 'bella',
  // Entrada común de la demo: celular 1111 + PIN 1111 sirve para todas las usuarias de Spa Uñas Bella.
  // Por "Dueña" entra la dueña; por "Manicurista" se elige con cuál manicurista entrar. (Un equipo real entra con su celular.)
  login: { phone: '1111', pin: '1111' },
  // cada una también tiene su código corto propio, con el mismo PIN
  owner: { name: 'Laura Gómez', phone: '3000', pin: '1111' },
  barbers: [
    { name: 'Camila Restrepo', phone: '4000', pin: '1111', branch: 0 },
    { name: 'Daniela Ospina', phone: '5000', pin: '1111', branch: 0 },
    { name: 'Mariana Zapata', phone: '6000', pin: '1111', branch: 0 },
    { name: 'Valeria Henao', phone: '7000', pin: '1111', branch: 0 },
  ],
}

/** ¿Funciona la entrada común 1111 / 1111 de la demo? Sí, salvo con DEMO_LOGIN=0. */
export function demoLoginEnabled() {
  return process.env.DEMO_LOGIN !== '0'
}

/**
 * ¿Mostrar los usuarios de prueba en la página de inicio? En el computador sí; en internet (Railway) no,
 * porque cualquiera podría entrar como dueña. SHOW_DEMO_LOGINS=1 / 0 lo fuerza.
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
  ['Valentina Pérez', '3104827719'], ['Juliana Herrera', '3156021834'], ['Sofía Castro', '3007714520'],
  ['Natalia Ramírez', '3209938471'], ['Paula Ortiz', '3125550198'], ['Isabella Vargas', '3013348862'],
  ['Manuela Torres', '3178842210'], ['Sara Moreno', '3146670035'], ['Catalina Jiménez', '3052219987'],
  ['Luisa Fernanda Quintero', '3187763341'], ['Ana María Restrepo', '3114402958'], ['Carolina Cárdenas', '3229081146'],
  ['Alejandra Salazar', '3165530712'], ['Gabriela Rincón', '3023396604'],
]
export const CLIENT_FIRST = ['Valentina', 'Juliana', 'Sofía', 'Natalia', 'Paula', 'Isabella', 'Manuela', 'Sara', 'Catalina', 'Luisa Fernanda', 'Ana María', 'Carolina', 'Alejandra', 'Gabriela', 'Andrea', 'Melissa', 'Tatiana', 'Lina', 'Paola', 'Diana', 'Verónica', 'Salomé', 'Antonia', 'Mónica', 'Juana', 'María José', 'Laura Sofía', 'Daniela', 'Mariana', 'Luciana', 'Ximena', 'Camila Andrea', 'Yuliana', 'Leidy', 'Marcela', 'Estefanía', 'Manuela Sofía', 'Valeria', 'Sara Lucía', 'Paulina', 'Kelly Johana', 'Angie', 'Vanessa', 'Natalia Andrea', 'Susana', 'Clara', 'Isabel', 'Margarita', 'Gloria Inés', 'Beatriz', 'Luz Marina']
export const CLIENT_LAST = ['Pérez', 'Herrera', 'Castro', 'Ramírez', 'Ortiz', 'Vargas', 'Torres', 'Moreno', 'Jiménez', 'Quintero', 'Restrepo', 'Cárdenas', 'Salazar', 'Rincón', 'López', 'Martínez', 'Rodríguez', 'García', 'Sánchez', 'Muñoz', 'Arias', 'Ospina', 'Valencia', 'Mejía', 'Londoño', 'Zapata', 'Giraldo', 'Cortés', 'Patiño', 'Suárez', 'Montoya', 'Henao', 'Agudelo', 'Betancur', 'Gaviria', 'Echeverri', 'Uribe', 'Escobar', 'Vélez', 'Posada', 'Arango', 'Tobón', 'Gómez', 'Álvarez', 'Correa', 'Duque', 'Franco', 'Hincapié', 'Naranjo', 'Ochoa', 'Palacio']
const PHONE_PREFIX = ['300', '301', '302', '304', '305', '310', '311', '312', '313', '314', '315', '316', '318', '320', '321', '322', '323', '350', '351']

/** Qué tan llena suele estar la agenda: viernes y sábados más, lunes y martes menos; la tarde temprano es floja. */
export const DAY_FACTOR = [0, 0.8, 0.85, 0.95, 1, 1.25, 1.45] // dom … sáb
export const hourFactor = (m: number) => (m < 11 * 60 ? 0.9 : m < 13 * 60 ? 1 : m < 16 * 60 ? 0.75 : m < 18 * 60 ? 1.05 : 1.3)

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

export const LINE_COLS = ['tenant_id', 'appointment_id', 'service_id', 'name', 'duration_min', 'price', 'is_addon', 'sort', 'charged', 'barber_share', 'rule']

export type DemoSvc = { id: string; name: string; duration_min: number; price: number; is_addon: boolean }

export async function seedIfEmpty(db: PGlite) {
  const { rows } = await db.query<{ n: number }>('select count(*)::int n from tenants')
  if (rows[0].n > 0) return
  await db.transaction(async (tx) => {
    const q = async <T = { id: string }>(sql: string, p: unknown[] = []) => (await tx.query<T>(sql, p)).rows
    const [t] = await q(`insert into tenants (slug, name, city, timezone) values ($1, 'Spa Uñas Bella', 'Medellín', $2) returning id`, [DEMO.slug, TZ])
    // Por ahora una sola sede (el sistema admite varias: se agregan en Ajustes)
    const branches = [(await q(`insert into branches (tenant_id, name, address, phone, sort) values ($1, 'El Poblado', 'Cl. 10 #40-25, local 104', '3045550101', 0) returning id`, [t.id]))[0]]
    const [owner] = await q(`insert into users (tenant_id, role, name, phone, pin_hash) values ($1, 'owner', $2, $3, $4) returning id`, [t.id, DEMO.owner.name, DEMO.owner.phone, hashPin(DEMO.owner.pin)])
    const barbers: { id: string; branch: string }[] = []
    for (const b of DEMO.barbers) {
      const branch = branches[b.branch].id
      const [u] = await q(`insert into users (tenant_id, role, name, phone, pin_hash, branch_id) values ($1, 'barber', $2, $3, $4, $5) returning id`, [t.id, b.name, b.phone, hashPin(b.pin), branch])
      for (let wd = 1; wd <= 6; wd++) {
        const end = wd === 6 ? 18 * 60 : 20 * 60
        await q(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [t.id, u.id, branch, wd, 9 * 60, 13 * 60])
        await q(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [t.id, u.id, branch, wd, 14 * 60, end])
      }
      barbers.push({ id: u.id, branch })
    }
    const services: DemoSvc[] = []
    for (const [i, c] of DEMO_CATALOG.entries()) {
      const [s] = await q(
        `insert into services (tenant_id, name, description, duration_min, price, sort, is_addon, refill_days) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [t.id, c.name, c.description, c.duration, c.price, i, !!c.addon, c.refillDays ?? null],
      )
      services.push({ id: s.id, name: c.name, duration_min: c.duration, price: c.price, is_addon: !!c.addon })
    }
    const svc = (name: string) => services.find((s) => s.name === name)!
    const refillDays = new Map(DEMO_CATALOG.filter((c) => c.refillDays).map((c) => [svc(c.name).id, c.refillDays!]))

    // ---------- clientas: unas 40 de antes, y van llegando nuevas; cada una suele volver con su manicurista ----------
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
    const now = new Date()
    const today = todayYmd(TZ, now)
    const nowMin = localParts(now, TZ).minutes
    const start0 = atLocal(addDaysYmd(today, -HISTORY_DAYS), 9 * 60, TZ)

    const clientRows: unknown[][] = []
    const clientById = new Map<string, { name: string; phone: string | null }>()
    const usedPhones = new Set([DEMO.owner.phone, ...DEMO.barbers.map((b) => b.phone)])
    const usedNames = new Set([DEMO.owner.name, ...DEMO.barbers.map((b) => b.name)])
    const byBarber: string[][] = barbers.map(() => [])
    const addClient = (name: string, phone: string, created: Date, barber: number) => {
      const id = randomUUID()
      usedPhones.add(phone)
      usedNames.add(name)
      clientRows.push([id, t.id, name, phone, created])
      clientById.set(id, { name, phone })
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
      do n = `${pick(CLIENT_FIRST)} ${pick(CLIENT_LAST)}`
      while (usedNames.has(n))
      return n
    }
    const before = (days: number) => new Date(start0.getTime() - days * 864e5)
    const named = NAMED_CLIENTS.map(([name, phone], i) => addClient(name, phone, before(30 + Math.floor(rnd() * 200)), i % barbers.length))
    for (let i = 0; i < 26; i++) addClient(newName(), newPhone(), before(10 + Math.floor(rnd() * 300)), i % barbers.length)
    const valentina = named[0] // clienta fija de Camila, con notas, colores y alergia
    const allClients = () => byBarber.flat()

    // ---------- esquemas de pago: cada manicurista distinta ----------
    const mondayOf = (ymd: string) => addDaysYmd(ymd, -((weekdayOf(ymd) + 6) % 7))
    const firstMonday = mondayOf(addDaysYmd(today, -HISTORY_DAYS))
    await q(`update tenants set ledger_start = $2 where id = $1`, [t.id, atLocal(firstMonday, 0, TZ)]) // la cuenta de las manicuristas arranca con el historial
    const shop: ShopRules = { defaultPct: 45, tipsToBarber: true, deductCardFee: false, cardFeePct: 3 } // = valores por defecto de la tabla tenants
    const schemes: (Scheme | null)[] = [
      // Camila: 50%, Uñas acrílicas al 55% y Nail art $4.000 fijo por línea
      { model: 'percent', percent: 50, rentAmount: null, rentPeriod: null, rates: { [svc('Uñas acrílicas').id]: { kind: 'percent', value: 55 }, [svc('Nail art (por uña)').id]: { kind: 'fixed', value: 4000 } } },
      null, // Daniela: la comisión por defecto del spa
      // Mariana: 45%, Retiro de semipermanente $5.000 fijo
      { model: 'percent', percent: 45, rentAmount: null, rentPeriod: null, rates: { [svc('Retiro de semipermanente').id]: { kind: 'fixed', value: 5000 } } },
      // Valeria: arriendo de puesto semanal
      { model: 'rent', percent: null, rentAmount: 300000, rentPeriod: 'weekly', rentSince: firstMonday, rates: {} },
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
    const weekEarn = barbers.map(() => new Map<string, number>()) // lo que ganó cada manicurista por semana (lunes)

    // ---------- historial: HISTORY_DAYS hacia atrás + hoy + 2 semanas adelante ----------
    const apptRows: unknown[][] = []
    const lineRows: unknown[][] = []
    const payRows: unknown[][] = []
    const msgRows: unknown[][] = [] // WhatsApp (simulados) de las citas que vienen
    const alertRows: unknown[][] = []
    const visits = new Map<string, { id: string; start: Date; end: Date; ymd: string; svc: DemoSvc[]; status: string }[]>() // por clienta, en orden
    const mins = (n: number) => n * 60_000
    let noShowToday = false
    const msg = (to: string | null, kind: 'client' | 'barber' | 'owner', template: Parameters<typeof render>[0], vars: Record<string, string>, appt: string, at: Date) => {
      if (to && at <= now) msgRows.push([t.id, to, kind, template, render(template, vars), appt, 'simulated', at])
    }
    for (let d = -HISTORY_DAYS; d <= 14; d++) {
      const ymd = addDaysYmd(today, d)
      const wd = weekdayOf(ymd)
      if (wd === 0) continue
      const growth = 0.85 + (0.15 * (d + HISTORY_DAYS)) / HISTORY_DAYS // el spa va creciendo
      barbers.forEach((b, bi) => {
        for (const [from, to] of [[9 * 60, 13 * 60], [14 * 60, wd === 6 ? 18 * 60 : 20 * 60]]) {
          let m = from
          while (m + 45 <= to) {
            let p = Math.min(0.95, 0.5 * growth * DAY_FACTOR[wd] * hourFactor(m) * seasonFactor(ymd))
            const future0 = d > 0 || (d === 0 && m > nowMin)
            if (future0) p *= futureFactor(d)
            if (rnd() > p) {
              m += 30
              continue
            }
            let combo = pickCombo(rnd, services)
            let dur = combo.reduce((a, x) => a + x.duration_min, 0)
            if (m + dur > to) {
              combo = combo.slice(0, 1)
              dur = combo[0].duration_min
              if (m + dur > to) break
            }
            const price = combo.reduce((a, x) => a + x.price, 0)
            const start = atLocal(ymd, m, TZ)
            const endAt = new Date(start.getTime() + dur * 60_000)
            // lo que aún no termina (o es más tarde) queda confirmado; lo que ya terminó se cobró
            const future = d > 0 || (d === 0 && m + dur > nowMin)
            let created = new Date(Math.min(now.getTime() - mins(90), start.getTime() - (1 + Math.floor(rnd() * 6)) * 864e5))
            let client: string
            if (bi === 0 && rnd() < 0.03) client = valentina
            else if (rnd() < 0.09) client = addClient(newName(), newPhone(), created, bi)
            else client = rnd() < 0.85 ? pick(byBarber[bi]) : pick(allClients())
            const source = rnd() < 0.7 ? 'online' : 'walkin'
            let status = 'completed'
            let decided: Date | null = created
            let reason: string | null = null
            let deadline: Date | null = null
            let note: string | null = source === 'online' && rnd() < 0.12 ? pick(CLIENT_NOTES) : null
            if (future) {
              status = 'confirmed'
              const r = rnd()
              if (source === 'online' && d >= 1 && d <= 7 && r < 0.08) {
                // solicitud recién llegada: la manicurista aún no responde
                status = 'pending'
                created = new Date(now.getTime() - mins(5 + Math.floor(rnd() * 80)))
                decided = null
                deadline = new Date(Math.min(created.getTime() + mins(120), start.getTime() - mins(30)))
              } else if (r >= 0.08 && r < 0.098) {
                // la clienta canceló desde su link (en los últimos días)
                status = 'cancelled'
                reason = 'Cancelada por la clienta'
                decided = new Date(Math.min(now.getTime() - mins(20), created.getTime() + (0.5 + rnd() * 2) * 864e5))
                if (decided < created) decided = new Date(created.getTime() + mins(30))
                note = null
              } else decided = new Date(Math.min(now.getTime() - mins(60), created.getTime() + mins(20 + Math.floor(rnd() * 60))))
            } else {
              const r = rnd()
              if (d === 0 && !noShowToday && bi === 2) {
                status = 'no_show'
                noShowToday = true
              } else if (r < 0.05) status = 'no_show'
              else if (r < 0.1) {
                status = 'cancelled'
                reason = rnd() < 0.6 ? 'Cancelada por la clienta' : pick(['La clienta pidió cambiar', 'Se enfermó', 'Viaje de trabajo'])
                decided = new Date(start.getTime() - mins(60 * (2 + Math.floor(rnd() * 40))))
                if (decided < created) decided = created
              }
            }
            const id = randomUUID()
            apptRows.push([id, t.id, b.branch, b.id, client, combo[0].id, start, endAt, status, source, price, created, decided, reason, deadline, note])
            let shares: { charged: number; barberShare: number; rule: string }[] | null = null
            if (status === 'completed') {
              const tip = demoTip(rnd)
              const method = pick(DEMO_METHODS)
              const sh = computeShare({ amount: price, tip, method, lines: combo.map((x) => ({ serviceId: x.id, price: x.price })) }, schemes[bi], shop)
              shares = sh.lines
              payRows.push([t.id, id, b.branch, b.id, client, combo[0].id, price, tip, method, endAt, sh.barberShare, sh.barberTip, sh.shopShare, sh.rule])
              const wk = mondayOf(ymd)
              weekEarn[bi].set(wk, (weekEarn[bi].get(wk) ?? 0) + sh.barberShare + sh.barberTip)
            }
            combo.forEach((x, i) =>
              lineRows.push([t.id, id, x.id, x.name, x.duration_min, x.price, x.is_addon, i, shares?.[i].charged ?? null, shares?.[i].barberShare ?? null, shares?.[i].rule ?? null]),
            )
            if (status !== 'cancelled' && status !== 'no_show') {
              const list = visits.get(client) ?? []
              list.push({ id, start, end: endAt, ymd, svc: combo, status })
              visits.set(client, list)
            }
            // WhatsApp de las citas de estos días (los que ya salieron) y avisos en la app
            if (d >= -1) {
              const c = clientById.get(client)!
              const bn = DEMO.barbers[bi].name
              const day = fmtDay(start, TZ)
              const time = fmtTime(start, TZ)
              const servicio = combo.map((x) => x.name).join(' + ')
              const nombre = firstName(c.name)
              if (source === 'online') {
                msg(c.phone, 'client', 'solicitud_recibida', { nombre, spa: 'Spa Uñas Bella', servicio, fecha: day, hora: time, manicurista: bn, plazo: '2 horas' }, id, created)
                msg(DEMO.barbers[bi].phone, 'barber', 'manicurista_nueva_solicitud', { manicurista: firstName(bn), cliente: c.name, servicio, fecha: day, hora: time, limite: fmtTime(new Date(created.getTime() + mins(120)), TZ) }, id, created)
              }
              if (status !== 'pending' && decided && source === 'online')
                msg(c.phone, 'client', 'cita_confirmada', { nombre, fecha: day, hora: time, manicurista: bn, sede: 'El Poblado', direccion: 'Cl. 10 #40-25, local 104' }, id, new Date(Math.min(decided.getTime(), created.getTime() + mins(40))))
              if (status === 'cancelled' && reason === 'Cancelada por la clienta' && decided) {
                msg(c.phone, 'client', 'cancelada_por_clienta', { nombre, fecha: day, hora: time, link: bookingLink(DEMO.slug) }, id, decided)
                msg(DEMO.barbers[bi].phone, 'barber', 'manicurista_cita_cancelada', { manicurista: firstName(bn), cliente: c.name, fecha: day, hora: time }, id, decided)
                if (future) {
                  const title = `${c.name} canceló su cita del ${day}, ${time} (${servicio})`
                  alertRows.push([t.id, owner.id, 'client_cancelled', title, id, decided, decided], [t.id, b.id, 'client_cancelled', title, id, decided, decided])
                }
              }
              if (status === 'confirmed' && d === 0 && start.getTime() - now.getTime() < mins(120) && start > now)
                msg(c.phone, 'client', 'recordatorio', { nombre, hora: time, manicurista: bn, sede: 'El Poblado' }, id, new Date(start.getTime() - mins(120)))
            }
            m += Math.ceil(dur / 15) * 15
          }
        }
      })
    }
    await insertMany(tx, 'clients', ['id', 'tenant_id', 'name', 'phone', 'created_at'], clientRows)
    await insertMany(
      tx,
      'appointments',
      ['id', 'tenant_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'starts_at', 'ends_at', 'status', 'source', 'price', 'created_at', 'decided_at', 'cancel_reason', 'approval_deadline', 'client_note'],
      apptRows,
    )
    await insertMany(tx, 'appointment_services', LINE_COLS, lineRows)
    await insertMany(
      tx,
      'payments',
      ['tenant_id', 'appointment_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'amount', 'tip', 'method', 'paid_at', 'barber_share', 'barber_tip', 'shop_share', 'rule'],
      payRows,
    )
    await q(
      `update clients set notes = $2, favorite_colors = $3, allergies = $4 where id = $1`,
      [
        valentina,
        'Prefiere forma almendrada, largo medio. Le gusta un tinto mientras espera.',
        'Nude rosado, rojo cereza; en diciembre burgundy con dorado',
        'Piel sensible a la acetona: usar removedor sin acetona y no limar la cutícula.',
      ],
    )
    await q(`update clients set allergies = $2, favorite_colors = $3 where id = $1`, [named[2], 'Alergia al látex: usar guantes de nitrilo.', 'Tonos pastel, lila'])
    await q(`update clients set favorite_colors = $2, notes = $3 where id = $1`, [named[5], 'Francés clásico, blanco leche', 'Viene cada 3 semanas, casi siempre el sábado.'])

    // ~18% de las clientas con colores y notas en la ficha; unas pocas con alergias
    const special = new Set<string>([valentina, named[2], named[5]])
    const fichas: [string, string | null, string | null, string | null][] = []
    let allergyCount = 0
    for (const r of clientRows) {
      const id = r[0] as string
      if (special.has(id) || rnd() >= 0.15) continue
      const allergy = allergyCount < FICHA_ALLERGIES.length && rnd() < 0.2 ? FICHA_ALLERGIES[allergyCount++] : null
      fichas.push([id, pick(FICHA_NOTES), pick(FICHA_COLORS), allergy])
    }
    for (const [id, notes, colors, allergies] of fichas)
      await q(`update clients set notes = $2, favorite_colors = $3, allergies = $4 where id = $1`, [id, notes, colors, allergies])
    // ---------- recordatorios de retoque (historial de los últimos 4 meses) ----------
    // Cada visita cobrada con un servicio de retoque deja su recordatorio. Si la clienta volvió antes, quedó reemplazado
    // ese día; si no, salió a las 10 a. m. del día que tocaba (con su mensaje). Los que vienen quedan pendientes.
    const refills: unknown[][] = []
    const sentMsgs: unknown[][] = []
    for (const [client, list] of visits) {
      const c = clientById.get(client)
      list.forEach((v, i) => {
        if (v.status !== 'completed' || v.ymd < addDaysYmd(today, -120)) return
        const line = v.svc.filter((x) => refillDays.has(x.id)).sort((a, b) => refillDays.get(a.id)! - refillDays.get(b.id)!)[0]
        if (!line || !c?.phone) return
        const due = atLocal(addDaysYmd(v.ymd, refillDays.get(line.id)!), 10 * 60, TZ)
        const next = list[i + 1]
        // volvió antes de que tocara: al cobrarle la nueva visita, este recordatorio quedó reemplazado.
        // Si ya tenía la próxima cita reservada cuando tocaba, no se envió (se marcó ese día).
        let skippedAt: Date | null = null
        if (next && next.start <= due && next.status === 'completed') skippedAt = next.end
        else if (next && due <= now && next.start.getTime() - due.getTime() < 3 * 864e5) skippedAt = due
        const sent = !skippedAt && due <= now
        refills.push([t.id, client, v.id, line.name, due, v.end, sent ? due : null, skippedAt])
        if (sent) {
          const vars = {
            nombre: firstName(c.name), spa: 'Spa Uñas Bella', servicio: line.name,
            dias: String(Math.max(1, Math.round((due.getTime() - v.start.getTime()) / 864e5))), link: bookingLink(DEMO.slug),
          }
          sentMsgs.push([t.id, c.phone, 'client', 'retoque', render('retoque', vars), v.id, 'simulated', due])
        }
      })
    }
    await insertMany(tx, 'refill_reminders', ['tenant_id', 'client_id', 'appointment_id', 'service_name', 'due_at', 'created_at', 'sent_at', 'skipped_at'], refills)
    await insertMany(tx, 'messages', ['tenant_id', 'to_phone', 'to_kind', 'template', 'body', 'appointment_id', 'status', 'created_at'], [...sentMsgs, ...msgRows])
    // avisos en la app: las dos cancelaciones más recientes siguen sin leer; las demás ya se vieron
    alertRows.sort((a, b) => (b[6] as Date).getTime() - (a[6] as Date).getTime())
    alertRows.slice(0, 4).forEach((r) => (r[5] = null))
    await insertMany(tx, 'alerts', ['tenant_id', 'user_id', 'kind', 'title', 'appointment_id', 'read_at', 'created_at'], alertRows)

    // ---------- pagos a las manicuristas ----------
    // Cada lunes la dueña les paga lo de la semana anterior; a veces un adelanto el miércoles.
    // Valeria paga el arriendo cada lunes; el de esta semana todavía no. Daniela pidió un adelanto esta semana.
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
          // un adelanto nunca pasa de lo que ganó esa semana (si no, el saldo quedaría a favor del spa)
          if (!asked && advance >= earned) advance = 0
        }
        if (advance > 0) {
          payoutRows.push([t.id, b.id, 'adelanto', advance, pick(['efectivo', 'nequi']), wed, null, owner.id])
        }
        if (nextMon <= today && earned - advance > 0)
          payoutRows.push([t.id, b.id, 'pago', earned - advance, pick(['efectivo', 'efectivo', 'nequi', 'transferencia']), nextMon, `Semana ${short(w)} – ${short(addDaysYmd(w, 6))}`, owner.id])
      })
    }
    await insertMany(tx, 'barber_payouts', ['tenant_id', 'barber_id', 'kind', 'amount', 'method', 'paid_on', 'note', 'created_by'], payoutRows)

    // Dos solicitudes pendientes para Camila: una recién llegada y otra que ya venció (la dueña recibe aviso).
    const camila = barbers[0]
    const tomorrow = addDaysYmd(today, weekdayOf(addDaysYmd(today, 1)) === 0 ? 2 : 1)
    const mk = async (ymd: string, min: number, client: string, createdAgoMin: number, windowMin: number) => {
      const start = atLocal(ymd, min, TZ)
      const combo = [svc('Manicure semipermanente'), svc('Retiro de semipermanente')]
      const dur = combo.reduce((a, x) => a + x.duration_min, 0)
      const end = new Date(start.getTime() + dur * 60_000)
      const clash = await q(`select id from appointments where barber_id = $1 and status in ('pending','confirmed') and starts_at < $3 and ends_at > $2`, [camila.id, start, end])
      for (const c of clash) {
        await q(`delete from messages where appointment_id = $1`, [c.id])
        await q(`delete from appointments where id = $1`, [c.id])
      }
      const created = new Date(now.getTime() - createdAgoMin * 60_000)
      const [a] = await q(
        `insert into appointments (tenant_id, branch_id, barber_id, client_id, service_id, starts_at, ends_at, status, source, price, created_at, approval_deadline, client_note)
         values ($1,$2,$3,$4,$5,$6,$7,'pending','online',$8,$9,$10,$11) returning id`,
        [t.id, camila.branch, camila.id, client, combo[0].id, start, end, combo[0].price + combo[1].price, created, new Date(created.getTime() + windowMin * 60_000), createdAgoMin < 60 ? 'Igual que la última vez' : null],
      )
      await insertMany(tx, 'appointment_services', LINE_COLS, combo.map((x, i) => [t.id, a.id, x.id, x.name, x.duration_min, x.price, x.is_addon, i, null, null, null]))
    }
    await mk(tomorrow, 10 * 60 + 30, valentina, 25, 120)
    await mk(tomorrow, 16 * 60, named[4], 150, 120)
  })
}
