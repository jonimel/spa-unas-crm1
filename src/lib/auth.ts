import { randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { one, rows } from './db'
import { verifyPin } from './pin'
import { rememberHost } from './base-url'
import { normalizeLoginPhone } from './phone'
import { DEMO, demoLoginEnabled } from './seed'

export type Role = 'owner' | 'barber'
export type CurrentUser = {
  id: string
  tenant_id: string
  role: Role
  name: string
  phone: string
  branch_id: string | null
  tenant_name: string
  tenant_slug: string
  timezone: string
}

const COOKIE = 'spa_session'
/** Nombre de la cookie antes de pasar a Spa Uñas: se sigue leyendo para no sacar a nadie de su sesión. */
const OLD_COOKIE = 'barbar_session'
const DAYS = 30

export const MAX_FAILS = 5
export const LOCK_MINUTES = 10

/** 'pick': la entrada común de la demo calzó con varios usuarios; se elige cuál en /entrar/elegir. */
export type LoginResult = 'ok' | 'bad' | 'locked' | 'pick'

/** Usuarios de la demo que abre la entrada común 1111 / 1111, según la puerta elegida (dueño o manicurista). */
async function demoUsers(pin: string, role: Role) {
  if (!demoLoginEnabled() || pin !== DEMO.login.pin) return []
  return rows<{ id: string }>(
    `select u.id from users u join tenants t on t.id = u.tenant_id
      where t.slug = $1 and u.active and u.role = $2 order by u.name`,
    [DEMO.slug, role],
  )
}

/**
 * Entrar con celular + PIN. Después de 5 PIN incorrectos seguidos para un celular, se bloquea 10 minutos.
 * `role` es la puerta elegida en Entrar: solo cuenta para la entrada común de la demo (1111 / 1111);
 * con un celular de verdad, el rol lo decide la cuenta.
 */
export async function login(phoneRaw: string, pin: string, role: Role = 'owner'): Promise<LoginResult> {
  const phone = normalizeLoginPhone(phoneRaw)
  if (!phone) return 'bad'
  const lock = await one<{ locked: boolean }>('select locked_until > now() locked from login_attempts where phone = $1', [phone])
  if (lock?.locked) return 'locked'
  let matched: string[]
  if (phone === DEMO.login.phone) matched = (await demoUsers(pin, role)).map((u) => u.id)
  else {
    const users = /^\d{4,6}$/.test(pin)
      ? await rows<{ id: string; pin_hash: string }>('select id, pin_hash from users where phone = $1 and active', [phone])
      : []
    const user = users.find((u) => verifyPin(pin, u.pin_hash))
    matched = user ? [user.id] : []
  }
  if (!matched.length) {
    // los fallos cuentan dentro de 15 minutos; al quinto se bloquea
    const r = await one<{ fails: number }>(
      `insert into login_attempts (phone, fails, first_fail_at) values ($1, 1, now())
       on conflict (phone) do update set
         fails = case when login_attempts.first_fail_at < now() - interval '15 minutes' or login_attempts.locked_until is not null then 1 else login_attempts.fails + 1 end,
         first_fail_at = case when login_attempts.first_fail_at < now() - interval '15 minutes' or login_attempts.locked_until is not null then now() else login_attempts.first_fail_at end,
         locked_until = null
       returning fails`,
      [phone],
    )
    if (r!.fails >= MAX_FAILS) {
      await one(`update login_attempts set locked_until = now() + make_interval(mins => $2) where phone = $1`, [phone, LOCK_MINUTES])
      return 'locked'
    }
    return 'bad'
  }
  await one('delete from login_attempts where phone = $1', [phone])
  if (matched.length > 1) {
    await startPick(matched)
    return 'pick'
  }
  await startSession(matched[0])
  return 'ok'
}

// ---- Elegir usuario después de la entrada común de la demo ----
// Se guarda en memoria del servidor (una sola instancia) por 10 minutos; la cookie solo lleva un código al azar.
const PICK_COOKIE = 'spa_pick'
const PICK_MINUTES = 10
const picks: Map<string, { ids: string[]; exp: number }> = ((globalThis as { __barbarPicks?: Map<string, { ids: string[]; exp: number }> }).__barbarPicks ??= new Map())

async function startPick(ids: string[]) {
  const now = Date.now()
  for (const [k, v] of picks) if (v.exp < now) picks.delete(k)
  const token = randomBytes(24).toString('hex')
  const exp = now + PICK_MINUTES * 60e3
  picks.set(token, { ids, exp })
  ;(await cookies()).set(PICK_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires: new Date(exp) })
}

/** Los usuarios entre los que se puede elegir ahora (o null si no hay una elección vigente). */
export async function pendingPick(): Promise<string[] | null> {
  const token = (await cookies()).get(PICK_COOKIE)?.value
  const p = token ? picks.get(token) : undefined
  return p && p.exp > Date.now() ? p.ids : null
}

/** Entra como el usuario elegido, si estaba en la elección vigente. */
export async function finishPick(userId: string): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get(PICK_COOKIE)?.value
  const p = token ? picks.get(token) : undefined
  if (!token || !p || p.exp < Date.now() || !p.ids.includes(userId)) return false
  picks.delete(token)
  jar.delete(PICK_COOKIE)
  await startSession(userId)
  return true
}

/** Abre la sesión (cookie de 30 días) para un usuario ya verificado. */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + DAYS * 864e5)
  await one('insert into sessions (token, user_id, expires_at) values ($1, $2, $3)', [token, userId, expires])
  const jar = await cookies()
  // "secure" solo si la página llegó por https (en el computador local es http, también en modo rápido)
  let https = false
  try {
    https = (await headers()).get('x-forwarded-proto') === 'https'
  } catch {}
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires, secure: https })
}

export async function logout() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value ?? jar.get(OLD_COOKIE)?.value
  if (token) await one('delete from sessions where token = $1', [token])
  jar.delete(COOKIE)
  jar.delete(OLD_COOKIE)
}

export async function currentUser(): Promise<CurrentUser | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value ?? jar.get(OLD_COOKIE)?.value
  try {
    rememberHost((await headers()).get('host'))
  } catch {}
  if (!token) return null
  return one<CurrentUser>(
    `select u.id, u.tenant_id, u.role, u.name, u.phone, u.branch_id,
            t.name as tenant_name, t.slug as tenant_slug, t.timezone
       from sessions s
       join users u on u.id = s.user_id and u.active
       join tenants t on t.id = u.tenant_id
      where s.token = $1 and s.expires_at > now()`,
    [token],
  )
}

export async function requireUser(role?: Role): Promise<CurrentUser> {
  const u = await currentUser()
  if (!u) redirect('/entrar')
  if (role && u.role !== role) redirect('/app')
  return u
}
