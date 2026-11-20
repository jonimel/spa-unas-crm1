import fs from 'node:fs'
import { TZDate } from '@date-fns/tz'
import path from 'node:path'
import { DATA_DIR, getDb, one, rows } from './db'

/**
 * Copias de seguridad de la base de datos local: un archivo .tar.gz con todo (citas, clientes, pagos…).
 * Se guarda una copia automática al día en la carpeta `backups/` (se conservan las últimas 14),
 * y el dueño puede descargar una en cualquier momento desde Ajustes. Para restaurar: `npm run restore`.
 */
export const BACKUP_DIR =
  process.env.SPA_BACKUP_DIR ??
  process.env.BARBAR_BACKUP_DIR ??
  (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'backups') : path.join(process.cwd(), 'backups'))
const KEEP = 14

// hora de Colombia (en Railway el servidor está en UTC y en el computador puede estar en otra zona)
const TZ = process.env.SPA_TZ ?? process.env.BARBAR_TZ ?? 'America/Bogota'
const stamp = (now = new Date()) => {
  const d = new TZDate(now.getTime(), TZ)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^(spa|barbar)-.*\.tar\.gz$/.test(f))
    // por fecha (el nombre empieza distinto en las copias de antes: barbar-…)
    .sort((a, b) => a.replace(/^\w+-/, '').localeCompare(b.replace(/^\w+-/, '')))
    .reverse()
}

export async function makeBackup() {
  if (DATA_DIR.startsWith('memory://')) throw new Error('La base de datos en memoria no se respalda')
  const db = await getDb()
  const blob = await db.dumpDataDir('gzip')
  const bytes = Buffer.from(await blob.arrayBuffer())
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const name = `spa-${stamp()}.tar.gz`
  fs.writeFileSync(path.join(BACKUP_DIR, name), bytes)
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(BACKUP_DIR, old), { force: true })
  return { name, bytes }
}

/** Hace la copia del día si todavía no hay una de hoy. */
export async function dailyBackup() {
  if (DATA_DIR.startsWith('memory://')) return null
  const today = stamp().slice(0, 10)
  if (listBackups().some((f) => f.replace(/^\w+-/, '').startsWith(today))) return null
  return makeBackup()
}

/** Tablas con datos de cada spa (todas llevan tenant_id). */
const TENANT_TABLES = [
  'branches', 'users', 'services', 'working_hours', 'time_off', 'clients', 'appointments',
  'payments', 'messages', 'alerts', 'barber_pay', 'barber_service_rates', 'barber_payouts',
  'appointment_services', 'refill_reminders',
] as const

/** ¿Hay más de un spa en esta base? Entonces la copia completa no se puede descargar desde la app. */
export async function isShared() {
  return (await one<{ n: number }>('select count(*)::int n from tenants'))!.n > 1
}

/**
 * Los datos de UN spa en un archivo JSON (para la dueña cuando hay varios spas en el mismo servidor).
 * Sin PIN ni sesiones. La copia completa diaria sigue en el servidor.
 */
export async function exportTenant(tenantId: string) {
  const tenant = await one<{ slug: string }>('select * from tenants where id = $1', [tenantId])
  const data: Record<string, unknown> = { exported_at: new Date().toISOString(), tenant }
  for (const table of TENANT_TABLES) {
    const list = await rows<Record<string, unknown>>(`select * from ${table} where tenant_id = $1`, [tenantId])
    if (table === 'users') for (const u of list) delete u.pin_hash
    data[table] = list
  }
  const name = `spa-${tenant!.slug}-${stamp()}.json`
  return { name, bytes: Buffer.from(JSON.stringify(data, null, 1)) }
}
