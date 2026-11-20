import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Para Railway: responde "ok" cuando el servidor y la base de datos están listos. */
export async function GET() {
  try {
    const db = await getDb()
    await db.query('select 1')
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
}
