import fs from 'node:fs'
import path from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'

/**
 * Base de datos local embebida (PostgreSQL en WASM, sin instalar nada).
 * Los datos quedan en la carpeta `.data/` del proyecto.
 * El esquema es PostgreSQL estándar: para producción se puede pasar a Supabase/Postgres
 * corriendo los mismos archivos de `db/migrations`.
 */

type Db = PGlite
type Queryable = Pick<PGlite, 'query'> | Transaction

const g = globalThis as unknown as { __spaDb?: Promise<Db> }

// En Railway los datos van en el volumen (disco permanente); Railway da su ruta en RAILWAY_VOLUME_MOUNT_PATH.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH
// SPA_DATA_DIR (antes BARBAR_DATA_DIR, que se sigue aceptando)
const DATA_ENV = process.env.SPA_DATA_DIR ?? process.env.BARBAR_DATA_DIR
export const DATA_DIR = DATA_ENV ?? (VOLUME ? path.join(VOLUME, 'pg') : path.join(process.cwd(), '.data', 'pg'))

async function open(): Promise<Db> {
  // En Railway, sin volumen el disco se borra en cada actualización: mejor no arrancar que perder las citas.
  if (process.env.RAILWAY_ENVIRONMENT && !VOLUME && !DATA_ENV) {
    throw new Error('Falta el volumen en Railway: agrega un Volume a este servicio con Mount path /data y vuelve a desplegar.')
  }
  return openDb()
}

async function openDb(): Promise<Db> {
  if (!DATA_DIR.startsWith('memory://')) fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new PGlite(DATA_DIR)
  await migrate(db)
  const { seedIfEmpty, upgradeDemoLogins } = await import('./seed')
  await seedIfEmpty(db)
  await upgradeDemoLogins(db)
  // la demo siempre con agenda de hoy y de los próximos días
  const { topUpDemo } = await import('./demo-fill')
  await topUpDemo(db).catch((e) => console.error('[spa] demo:', e))
  // pagos sin repartición (de antes de la fase 2 o recién sembrados): calcular comisión
  const { settlePending } = await import('./payroll')
  await settlePending(db)
  return db
}

export async function migrate(db: Db) {
  await db.exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`)
  const dir = path.join(process.cwd(), 'db', 'migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name))
  for (const f of files) {
    if (done.has(f)) continue
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into _migrations (name) values ($1)', [f])
    })
  }
}

/** Cierra la base (guarda todo en disco) antes de apagar el servidor. */
export async function shutdown() {
  const pending = g.__spaDb
  if (!pending) return
  const db = await pending.catch(() => null)
  if (db && !db.closed) await db.close()
}

export function getDb(): Promise<Db> {
  if (!g.__spaDb) {
    g.__spaDb = open().catch((e) => {
      g.__spaDb = undefined
      throw e
    })
  }
  return g.__spaDb
}

export async function rows<T>(sql: string, params: unknown[] = [], on?: Queryable): Promise<T[]> {
  const db = on ?? (await getDb())
  return (await db.query<T>(sql, params)).rows
}

export async function one<T>(sql: string, params: unknown[] = [], on?: Queryable): Promise<T | null> {
  return (await rows<T>(sql, params, on))[0] ?? null
}

export async function tx<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  const db = await getDb()
  return db.transaction(fn)
}

export type { Transaction, Queryable }
