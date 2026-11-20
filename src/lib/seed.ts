import { randomUUID } from 'node:crypto'
import type { PGlite, Transaction } from '@electric-sql/pglite'
import { computeShare, type Scheme, type ShopRules } from './commission'
import { DEMO_CATALOG, pickCombo } from './demo-catalog'
import { bookingLink } from './booking'
import { firstName } from './phone'
import { hashPin, verifyPin } from './pin'
import { render } from './whatsapp'
import { addDaysYmd, atLocal, fmtYmdShort, localParts, todayYmd, weekdayOf } from './time'

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
export const CLIENT_FIRST = ['Valentina', 'Juliana', 'Sofía', 'Natalia', 'Paula', 'Isabella', 'Manuela', 'Sara', 'Catalina', 'Luisa Fernanda', 'Ana María', 'Carolina', 'Alejandra', 'Gabriela', 'Andrea', 'Melissa', 'Tatiana', 'Lina', 'Paola', 'Diana', 'Verónica', 'Salomé', 'Antonia', 'Mónica', 'Juana', 'María José', 'Laura Sofía', 'Daniela', 'Mariana', 'Luciana']
export const CLIENT_LAST = ['Pérez', 'Herrera', 'Castro', 'Ramírez', 'Ortiz', 'Vargas', 'Torres', 'Moreno', 'Jiménez', 'Quintero', 'Restrepo', 'Cárdenas', 'Salazar', 'Rincón', 'López', 'Martínez', 'Rodríguez', 'García', 'Sánchez', 'Muñoz', 'Arias', 'Ospina', 'Valencia', 'Mejía', 'Londoño', 'Zapata', 'Giraldo', 'Cortés', 'Patiño', 'Suárez']
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
    const branches = [(await q(`insert into branches (tenant_id, name, address, phone, sort) values ($1, 'El Poblado', 'Cl. 10 #40-25, local 104', '6045550101', 0) returning id`, [t.id]))[0]]
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

    // ---------- historial: HISTORY_DAYS hacia atrás + hoy + 3 días adelante ----------
    const methods = ['efectivo', 'efectivo', 'nequi', 'nequi', 'nequi', 'tarjeta', 'tarjeta', 'daviplata', 'transferencia']
    const apptRows: unknown[][] = []
    const lineRows: unknown[][] = []
    const payRows: unknown[][] = []
    const lastVisit = new Map<string, { id: string; start: Date; ymd: string; svc: DemoSvc[]; status: string }>()
    for (let d = -HISTORY_DAYS; d <= 3; d++) {
      const ymd = addDaysYmd(today, d)
      const wd = weekdayOf(ymd)
      if (wd === 0) continue
      const growth = 0.85 + (0.15 * (d + HISTORY_DAYS)) / HISTORY_DAYS // el spa va creciendo
      barbers.forEach((b, bi) => {
        for (const [from, to] of [[9 * 60, 13 * 60], [14 * 60, wd === 6 ? 18 * 60 : 20 * 60]]) {
          let m = from
          while (m + 45 <= to) {
            let p = Math.min(0.95, 0.5 * growth * DAY_FACTOR[wd] * hourFactor(m))
            const future0 = d > 0 || (d === 0 && m > nowMin)
            if (future0) p *= d === 0 ? 0.75 : 0.55
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
            const created = new Date(start.getTime() - (1 + Math.floor(rnd() * 4)) * 864e5)
            let client: string
            if (bi === 0 && rnd() < 0.03) client = valentina
            else if (rnd() < 0.09) client = addClient(newName(), newPhone(), created, bi)
            else client = rnd() < 0.85 ? pick(byBarber[bi]) : pick(allClients())
            let status = 'completed'
            if (future) status = 'confirmed'
            else {
              const r = rnd()
              if (r < 0.05) status = 'no_show'
              else if (r < 0.1) status = 'cancelled'
            }
            const id = randomUUID()
            apptRows.push([id, t.id, b.branch, b.id, client, combo[0].id, start, endAt, status, rnd() < 0.7 ? 'online' : 'walkin', price, created, created])
            let shares: { charged: number; barberShare: number; rule: string }[] | null = null
            if (status === 'completed') {
              const tip = rnd() < 0.35 ? pick([2000, 5000, 5000, 10000]) : 0
              const method = pick(methods)
              const sh = computeShare({ amount: price, tip, method, lines: combo.map((x) => ({ serviceId: x.id, price: x.price })) }, schemes[bi], shop)
              shares = sh.lines
              payRows.push([t.id, id, b.branch, b.id, client, combo[0].id, price, tip, method, endAt, sh.barberShare, sh.barberTip, sh.shopShare, sh.rule])
              const wk = mondayOf(ymd)
              weekEarn[bi].set(wk, (weekEarn[bi].get(wk) ?? 0) + sh.barberShare + sh.barberTip)
            }
            combo.forEach((x, i) =>
              lineRows.push([t.id, id, x.id, x.name, x.duration_min, x.price, x.is_addon, i, shares?.[i].charged ?? null, shares?.[i].barberShare ?? null, shares?.[i].rule ?? null]),
            )
            if (status !== 'cancelled' && status !== 'no_show') lastVisit.set(client, { id, start, ymd, svc: combo, status })
            m += Math.ceil(dur / 15) * 15
          }
        }
      })
    }
    await insertMany(tx, 'clients', ['id', 'tenant_id', 'name', 'phone', 'created_at'], clientRows)
    await insertMany(tx, 'appointments', ['id', 'tenant_id', 'branch_id', 'barber_id', 'client_id', 'service_id', 'starts_at', 'ends_at', 'status', 'source', 'price', 'created_at', 'decided_at'], apptRows)
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

    // ---------- recordatorios de retoque de las visitas recientes ----------
    // Los que ya tocaron quedan enviados a las 10 a. m. de su día (con su mensaje), como si el sistema hubiera
    // estado corriendo; los demás quedan pendientes y salen solos cuando llegue su día.
    const clientInfo = new Map(clientRows.map((r) => [r[0] as string, { name: r[2] as string, phone: r[3] as string | null }]))
    const refills: unknown[][] = []
    const sentMsgs: unknown[][] = []
    for (const [client, v] of lastVisit) {
      if (v.status !== 'completed' || v.ymd < addDaysYmd(today, -25)) continue
      const line = v.svc.filter((x) => refillDays.has(x.id)).sort((a, b) => refillDays.get(a.id)! - refillDays.get(b.id)!)[0]
      if (!line) continue
      const due = atLocal(addDaysYmd(v.ymd, refillDays.get(line.id)!), 10 * 60, TZ)
      const c = clientInfo.get(client)
      const sent = due <= now && !!c?.phone
      refills.push([t.id, client, v.id, line.name, due, v.start, sent ? due : null, due <= now && !sent ? due : null])
      if (sent) {
        const vars = {
          nombre: firstName(c.name), spa: 'Spa Uñas Bella', servicio: line.name.toLowerCase(),
          dias: String(Math.max(1, Math.round((due.getTime() - v.start.getTime()) / 864e5))), link: bookingLink(DEMO.slug),
        }
        sentMsgs.push([t.id, c.phone, 'client', 'retoque', render('retoque', vars), v.id, 'simulated', due])
      }
    }
    await insertMany(tx, 'refill_reminders', ['tenant_id', 'client_id', 'appointment_id', 'service_name', 'due_at', 'created_at', 'sent_at', 'skipped_at'], refills)
    await insertMany(tx, 'messages', ['tenant_id', 'to_phone', 'to_kind', 'template', 'body', 'appointment_id', 'status', 'created_at'], sentMsgs)

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
      for (const c of clash) await q(`delete from appointments where id = $1`, [c.id])
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
