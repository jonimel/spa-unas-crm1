'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logout, requireUser } from '@/lib/auth'
import { AlreadyPaid, approve, cancel, checkout, markNoShow, reject, PAY_METHODS, type PayMethod } from '@/lib/appointments'
import { BookingError, createAppointment, tenantById } from '@/lib/booking'
import { one, rows, tx } from '@/lib/db'
import { hashPin } from '@/lib/pin'
import { normalizeCoPhone, PHONE_ERROR } from '@/lib/phone'
import { PAYOUT_METHODS } from '@/lib/commission'
import { atLocal, isYmd, localParts, todayYmd } from '@/lib/time'

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

function back(to: string, msg: { ok?: string; err?: string }): never {
  const u = new URL(to, 'http://x')
  if (msg.ok) u.searchParams.set('ok', msg.ok)
  if (msg.err) u.searchParams.set('err', msg.err)
  redirect(u.pathname + u.search)
}

async function guard<T>(to: string, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof BookingError) back(to, { err: e.message })
    throw e
  }
}

// ---------------- citas ----------------

export async function approveAction(fd: FormData) {
  const user = await requireUser()
  const to = s(fd, 'back') || '/app/agenda'
  await guard(to, () => approve(user, s(fd, 'id')))
  revalidatePath('/app', 'layout')
  back(to, { ok: 'Cita confirmada. Le avisamos al cliente por WhatsApp.' })
}

export async function rejectAction(fd: FormData) {
  const user = await requireUser()
  const to = s(fd, 'back') || '/app/agenda'
  await guard(to, () => reject(user, s(fd, 'id'), s(fd, 'reason') || undefined))
  revalidatePath('/app', 'layout')
  back(to, { ok: 'Solicitud rechazada. El cliente recibió el link para elegir otra hora.' })
}

export async function cancelAction(fd: FormData) {
  const user = await requireUser()
  const id = s(fd, 'id')
  await guard(`/app/cita/${id}`, () => cancel(user, id, s(fd, 'reason') || undefined))
  revalidatePath('/app', 'layout')
  back(`/app/cita/${id}`, { ok: 'Cita cancelada. Le avisamos al cliente.' })
}

export async function noShowAction(fd: FormData) {
  const user = await requireUser()
  const id = s(fd, 'id')
  await guard(`/app/cita/${id}`, () => markNoShow(user, id))
  back(`/app/cita/${id}`, { ok: 'Marcada como "no vino".' })
}

export async function checkoutAction(fd: FormData) {
  const user = await requireUser()
  const id = s(fd, 'id')
  const amount = Number(s(fd, 'amount').replace(/\D/g, ''))
  const tip = Number(s(fd, 'tip').replace(/\D/g, '') || 0)
  const method = s(fd, 'method') as PayMethod
  if (!PAY_METHODS.includes(method)) back(`/app/cobrar/${id}`, { err: 'Elige el medio de pago' })
  // doble toque en "Registrar pago": el segundo encuentra la visita ya cobrada y no es un error
  await guard(`/app/cobrar/${id}`, () => checkout(user, id, amount, tip, method).catch((e) => { if (!(e instanceof AlreadyPaid)) throw e }))
  revalidatePath('/app', 'layout')
  back('/app/agenda', { ok: 'Visita cobrada ✓' })
}

/** Cliente de paso o cita agendada por la manicurista/dueño (queda confirmada de una). */
export async function newAppointmentAction(fd: FormData) {
  const user = await requireUser()
  const t = (await tenantById(user.tenant_id))!
  const to = '/app/nueva'
  const barberId = user.role === 'owner' ? s(fd, 'barber') : user.id
  const branch = await one<{ branch_id: string }>(
    `select w.branch_id from working_hours w where w.barber_id = $1 order by (w.branch_id = (select branch_id from users where id = $1)) desc limit 1`,
    [barberId],
  )
  const branchId = s(fd, 'branch') || branch?.branch_id
  if (!branchId) back(to, { err: 'La manicurista no tiene horario en ninguna sede' })
  const rawPhone = s(fd, 'phone')
  const phone = rawPhone ? normalizeCoPhone(rawPhone) : null
  if (rawPhone && !phone) back(to, { err: PHONE_ERROR })
  const name = s(fd, 'name') || (phone ? '' : 'Cliente de paso')
  let clientName = name
  if (!clientName && phone) {
    const c = await one<{ name: string }>('select name from clients where tenant_id = $1 and phone = $2', [t.id, phone])
    clientName = c?.name ?? 'Cliente'
  }
  let start: Date
  if (s(fd, 'when') === 'now') {
    start = new Date()
    start.setSeconds(0, 0)
  } else {
    const ymd = s(fd, 'date')
    const [h, m] = s(fd, 'time').split(':').map(Number)
    if (!isYmd(ymd) || !Number.isFinite(h)) back(to, { err: 'Elige día y hora' })
    start = atLocal(ymd, h * 60 + (m || 0), t.timezone)
  }
  const id = await guard(to, () =>
    createAppointment({
      tenantId: t.id,
      branchId: branchId!,
      serviceIds: fd.getAll('service').map((v) => String(v)),
      start,
      barberId,
      clientName,
      clientPhone: phone,
      note: s(fd, 'note') || null,
      source: s(fd, 'when') === 'now' ? 'walkin' : 'staff',
      createdBy: user.id,
    }),
  )
  revalidatePath('/app', 'layout')
  if (s(fd, 'when') === 'now') redirect(`/app/cobrar/${id}?ok=${encodeURIComponent('Cliente de paso registrado. Cobra cuando termines.')}`)
  back(`/app/agenda?date=${localParts(start, t.timezone).ymd}`, { ok: 'Cita agendada' })
}

// ---------------- clientes ----------------

/** Ficha de la clienta: notas, colores favoritos y alergias (el equipo las ve en la agenda y la cita). */
export async function saveClientNotes(fd: FormData) {
  const user = await requireUser()
  const id = s(fd, 'id')
  await one('update clients set notes = $3, favorite_colors = $4, allergies = $5 where id = $1 and tenant_id = $2', [
    id,
    user.tenant_id,
    s(fd, 'notes').slice(0, 2000) || null,
    s(fd, 'favorite_colors').slice(0, 300) || null,
    s(fd, 'allergies').slice(0, 300) || null,
  ])
  revalidatePath('/app', 'layout')
  back(`/app/clientes/${id}`, { ok: 'Ficha guardada' })
}

export async function readAlert(fd: FormData) {
  const user = await requireUser()
  await one('update alerts set read_at = now() where id = $1 and user_id = $2', [s(fd, 'id'), user.id])
  revalidatePath('/app', 'layout')
  back('/app/agenda', {})
}

// ---------------- ajustes (solo dueño) ----------------

export async function saveService(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const name = s(fd, 'name')
  const dur = Number(s(fd, 'duration'))
  const price = Number(s(fd, 'price').replace(/\D/g, ''))
  if (!name || !(dur > 0) || !(price >= 0)) back('/app/ajustes', { err: 'Revisa nombre, duración y precio' })
  const active = fd.get('active') === 'on'
  const addon = fd.get('is_addon') === 'on'
  const refillRaw = s(fd, 'refill_days')
  const refill = refillRaw ? Number(refillRaw) : null
  if (refill !== null && !(Number.isInteger(refill) && refill >= 1 && refill <= 365)) back('/app/ajustes', { err: 'Los días para el retoque van de 1 a 365' })
  if (id)
    await one(`update services set name=$3, description=$4, duration_min=$5, price=$6, active=$7, is_addon=$8, refill_days=$9 where id=$1 and tenant_id=$2`, [
      id,
      user.tenant_id,
      name,
      s(fd, 'description') || null,
      dur,
      price,
      active,
      addon,
      refill,
    ])
  else
    await one(
      `insert into services (tenant_id, name, description, duration_min, price, is_addon, refill_days, sort) values ($1,$2,$3,$4,$5,$6,$7,(select coalesce(max(sort),0)+1 from services where tenant_id=$1))`,
      [user.tenant_id, name, s(fd, 'description') || null, dur, price, addon, refill],
    )
  back('/app/ajustes', { ok: 'Servicio guardado' })
}

export async function saveBranch(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const name = s(fd, 'name')
  if (!name) back('/app/ajustes', { err: 'La sede necesita nombre' })
  if (id) await one(`update branches set name=$3, address=$4 where id=$1 and tenant_id=$2`, [id, user.tenant_id, name, s(fd, 'address') || null])
  else await one(`insert into branches (tenant_id, name, address, sort) values ($1,$2,$3,(select coalesce(max(sort),0)+1 from branches where tenant_id=$1))`, [user.tenant_id, name, s(fd, 'address') || null])
  back('/app/ajustes', { ok: 'Sede guardada' })
}

/** Cerrar una sede: deja de aparecer en reservas, agenda y ajustes, pero su historial queda en los reportes. */
export async function closeBranch(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const b = await one<{ name: string }>('select name from branches where id = $1 and tenant_id = $2 and active', [id, user.tenant_id])
  if (!b) back('/app/ajustes', { err: 'Sede no encontrada' })
  const open = await one<{ n: number }>('select count(*)::int n from branches where tenant_id = $1 and active', [user.tenant_id])
  if (open!.n <= 1) back('/app/ajustes', { err: 'No puedes cerrar la única sede abierta' })
  const barbers = await rows<{ name: string }>(`select name from users where tenant_id = $1 and branch_id = $2 and role = 'barber' and active order by name`, [user.tenant_id, id])
  if (barbers.length)
    back('/app/ajustes', {
      err: `Antes de cerrar ${b!.name}, pasa a otra sede o desactiva a: ${barbers.map((x) => x.name).join(', ')}`,
    })
  const future = await one<{ n: number }>(
    `select count(*)::int n from appointments where tenant_id = $1 and branch_id = $2 and status in ('pending', 'confirmed') and starts_at > now()`,
    [user.tenant_id, id],
  )
  if (future!.n > 0)
    back('/app/ajustes', { err: `${b!.name} tiene ${future!.n === 1 ? '1 cita próxima' : `${future!.n} citas próximas`}. Cancélalas antes de cerrar la sede.` })
  await one('update branches set active = false where id = $1 and tenant_id = $2', [id, user.tenant_id])
  revalidatePath('/', 'layout')
  back('/app/ajustes', { ok: `${b!.name} quedó cerrada. Su historial sigue en los reportes.` })
}

export async function reopenBranch(fd: FormData) {
  const user = await requireUser('owner')
  await one('update branches set active = true where id = $1 and tenant_id = $2', [s(fd, 'id'), user.tenant_id])
  revalidatePath('/', 'layout')
  back('/app/ajustes', { ok: 'Sede abierta de nuevo' })
}

export async function saveBarber(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const name = s(fd, 'name')
  const typed = s(fd, 'phone').replace(/\D/g, '')
  const saved = id ? await one<{ phone: string }>('select phone from users where id = $1 and tenant_id = $2', [id, user.tenant_id]) : null
  const phone = normalizeCoPhone(s(fd, 'phone')) ?? (saved?.phone === typed ? typed : null)
  const pin = s(fd, 'pin')
  const branchId = s(fd, 'branch') || null
  const to = id ? `/app/ajustes/manicurista/${id}` : '/app/ajustes/manicurista/nuevo'
  if (!name) back(to, { err: 'Falta el nombre' })
  if (!phone) back(to, { err: PHONE_ERROR })
  if (pin && !/^\d{4,6}$/.test(pin)) back(to, { err: 'El PIN son 4 a 6 números' })
  if (!id && !pin) back(to, { err: 'Asigna un PIN para que pueda entrar' })
  const dup = await one(`select 1 from users where tenant_id=$1 and phone=$2 and id <> coalesce(nullif($3,'')::uuid, '00000000-0000-0000-0000-000000000000')`, [user.tenant_id, phone, id])
  if (dup) back(to, { err: 'Ya hay alguien del equipo con ese celular' })
  // al entrar solo se escribe celular + PIN: un celular no puede estar en dos spas
  const elsewhere = await one(`select 1 from users where phone = $1 and tenant_id <> $2`, [phone, user.tenant_id])
  if (elsewhere) back(to, { err: 'Ese celular ya está registrado en otro spa. Usa otro celular.' })
  let barberId = id
  if (id && fd.get('active') !== 'on') {
    const future = await one<{ n: number }>(
      `select count(*)::int n from appointments where tenant_id = $1 and barber_id = $2 and status in ('pending', 'confirmed') and starts_at > now()`,
      [user.tenant_id, id],
    )
    if (future!.n > 0)
      back(to, {
        err: `${name} tiene ${future!.n === 1 ? '1 cita próxima' : `${future!.n} citas próximas`}. Cancélalas o pásalas a otra manicurista antes de desactivarla.`,
      })
  }
  if (id) {
    await one(`update users set name=$3, phone=$4, branch_id=$5, active=$6 where id=$1 and tenant_id=$2 and role='barber'`, [id, user.tenant_id, name, phone, branchId, fd.get('active') === 'on'])
    if (pin) await one(`update users set pin_hash=$3 where id=$1 and tenant_id=$2`, [id, user.tenant_id, hashPin(pin)])
  } else {
    const r = await one<{ id: string }>(`insert into users (tenant_id, role, name, phone, pin_hash, branch_id) values ($1,'barber',$2,$3,$4,$5) returning id`, [user.tenant_id, name, phone, hashPin(pin), branchId])
    barberId = r!.id
  }
  // horario semanal: h_<día>_<bloque>_start / _end como "HH:MM"
  if (branchId) {
    const blocks: [number, number, number][] = []
    for (let wd = 0; wd <= 6; wd++) {
      for (const b of [0, 1]) {
        const a = toMin(s(fd, `h_${wd}_${b}_start`))
        const z = toMin(s(fd, `h_${wd}_${b}_end`))
        if (a === null && z === null) continue
        if (a === null || z === null || z <= a) back(to, { err: 'Revisa el horario: cada bloque necesita inicio y fin' })
        blocks.push([wd, a, z])
      }
    }
    await one(`delete from working_hours where barber_id=$1 and tenant_id=$2`, [barberId, user.tenant_id])
    for (const [wd, a, z] of blocks)
      await one(`insert into working_hours (tenant_id, barber_id, branch_id, weekday, start_min, end_min) values ($1,$2,$3,$4,$5,$6)`, [user.tenant_id, barberId, branchId, wd, a, z])
  }
  back('/app/ajustes', { ok: 'Manicurista guardada' })
}

function toMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export async function changeMyPin(fd: FormData) {
  const user = await requireUser()
  const pin = s(fd, 'pin')
  if (!/^\d{4,6}$/.test(pin)) back('/app/cuenta', { err: 'El PIN son 4 a 6 números' })
  await one('update users set pin_hash=$2 where id=$1', [user.id, hashPin(pin)])
  back('/app/cuenta', { ok: 'PIN actualizado' })
}

export async function logoutAction() {
  await logout()
  redirect('/entrar')
}

// ---------------- comisiones (solo dueño) ----------------

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))
const money = (v: string) => Number(v.replace(/[^\d]/g, ''))

export async function saveShopRules(fd: FormData) {
  const user = await requireUser('owner')
  const pct = num(s(fd, 'defaultPct'))
  const fee = num(s(fd, 'cardFeePct') || '0')
  if (!(pct >= 0 && pct <= 100) || !(fee >= 0 && fee <= 20)) back('/app/comisiones', { err: 'Revisa los porcentajes' })
  await one(
    `update tenants set default_commission_pct=$2, tips_to_barber=$3, deduct_card_fee=$4, card_fee_pct=$5 where id=$1`,
    [user.tenant_id, pct, fd.get('tipsToBarber') === 'on', fd.get('deductCardFee') === 'on', fee],
  )
  back('/app/comisiones', { ok: 'Reglas guardadas. Aplican a los cobros nuevos.' })
}

export async function saveBarberScheme(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const to = `/app/comisiones/${id}?tab=esquema`
  const barber = await one('select 1 from users where id = $1 and tenant_id = $2 and role = $3', [id, user.tenant_id, 'barber'])
  if (!barber) back('/app/comisiones', { err: 'Manicurista no encontrada' })
  const model = s(fd, 'model')
  if (!['percent', 'fixed', 'rent'].includes(model)) back(to, { err: 'Elige el tipo de esquema' })
  const pctRaw = s(fd, 'percent')
  const percent = pctRaw === '' ? null : num(pctRaw)
  if (percent !== null && !(percent >= 0 && percent <= 100)) back(to, { err: 'El porcentaje va de 0 a 100' })
  let rentAmount: number | null = null
  let rentPeriod: string | null = null
  if (model === 'rent') {
    rentAmount = money(s(fd, 'rentAmount'))
    rentPeriod = s(fd, 'rentPeriod') || 'weekly'
    if (!(rentAmount > 0) || !['daily', 'weekly', 'monthly'].includes(rentPeriod)) back(to, { err: 'Escribe el valor del arriendo' })
  }
  const services = await rows<{ id: string; name: string }>('select id, name from services where tenant_id = $1', [user.tenant_id])
  const rates: { service: string; kind: string; value: number }[] = []
  for (const sv of services) {
    const raw = s(fd, `value_${sv.id}`)
    // en "monto fijo", escribir un valor sin cambiar el tipo ya es un monto fijo
    const kind = s(fd, `kind_${sv.id}`) || (model === 'fixed' && raw !== '' ? 'fixed' : '')
    if (!kind) {
      if (raw !== '') back(to, { err: `Elige “%” o “$ fijo” para ${sv.name}` })
      continue
    }
    if (raw === '') back(to, { err: `Falta el valor para ${sv.name}` })
    const value = kind === 'fixed' ? money(raw) : num(raw)
    if (!(value >= 0) || (kind === 'percent' && value > 100)) back(to, { err: `Revisa el valor de ${sv.name}` })
    rates.push({ service: sv.id, kind, value })
  }
  await tx(async (on) => {
    await on.query(
      // el arriendo corre desde hoy si recién pasa a arriendo; si ya estaba en arriendo, sigue igual
      `insert into barber_pay (barber_id, tenant_id, model, percent, rent_amount, rent_period, rent_since, updated_at)
       values ($1,$2,$3,$4,$5,$6, $7::date, now())
       on conflict (barber_id) do update set model=excluded.model, percent=excluded.percent,
         rent_amount=excluded.rent_amount, rent_period=excluded.rent_period,
         rent_since=case when excluded.model = 'rent' then coalesce(case when barber_pay.model = 'rent' then barber_pay.rent_since end, excluded.rent_since) end,
         updated_at=now()`,
      [id, user.tenant_id, model, percent, rentAmount, rentPeriod, model === 'rent' ? todayYmd(user.timezone) : null],
    )
    await on.query('delete from barber_service_rates where barber_id = $1 and tenant_id = $2', [id, user.tenant_id])
    for (const r of rates)
      await on.query(`insert into barber_service_rates (barber_id, service_id, tenant_id, kind, value) values ($1,$2,$3,$4,$5)`, [id, r.service, user.tenant_id, r.kind, r.value])
  })
  back(to, { ok: 'Esquema guardado. Aplica a los cobros desde ahora.' })
}

// ---------------- pagos a manicuristas ----------------

/** Registrar un pago o adelanto a la manicurista, o el arriendo que paga una manicurista de puesto. */
export async function recordPayout(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  const to = `/app/comisiones/${id}`
  const barber = await one('select 1 from users where id = $1 and tenant_id = $2 and role = $3', [id, user.tenant_id, 'barber'])
  if (!barber) back('/app/comisiones', { err: 'Manicurista no encontrada' })
  const kind = s(fd, 'kind')
  if (!['pago', 'adelanto', 'arriendo'].includes(kind)) back(to, { err: 'Elige el tipo de pago' })
  const amount = money(s(fd, 'amount'))
  if (!(amount > 0)) back(to, { err: 'Escribe el valor' })
  const method = s(fd, 'method')
  if (!(PAYOUT_METHODS as readonly string[]).includes(method)) back(to, { err: 'Elige cómo se pagó' })
  const date = s(fd, 'date')
  if (!isYmd(date) || date > todayYmd(user.timezone)) back(to, { err: 'Revisa la fecha: no puede ser futura' })
  await one(
    `insert into barber_payouts (tenant_id, barber_id, kind, amount, method, paid_on, note, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [user.tenant_id, id, kind, amount, method, date, s(fd, 'note') || null, user.id],
  )
  revalidatePath('/app', 'layout')
  back(to, { ok: kind === 'arriendo' ? 'Pago de arriendo registrado' : kind === 'adelanto' ? 'Adelanto registrado' : 'Pago registrado' })
}

/** Anular un pago registrado por error (queda en el historial como anulado). */
export async function voidPayout(fd: FormData) {
  const user = await requireUser('owner')
  const id = s(fd, 'id')
  await one(`update barber_payouts set voided_at = now(), voided_by = $3 where id = $1 and tenant_id = $2 and voided_at is null`, [s(fd, 'payout'), user.tenant_id, user.id])
  revalidatePath('/app', 'layout')
  back(`/app/comisiones/${id}`, { ok: 'Pago anulado' })
}
