import { requireUser } from '@/lib/auth'
import { exportTenant, isShared, makeBackup } from '@/lib/backup'

/**
 * Descargar una copia (solo el dueño).
 * - Un solo spa en el servidor: la copia completa (.tar.gz, se restaura con `npm run restore`); también queda en backups/.
 * - Varios spas: solo los datos de la suya, en JSON (nunca los de las otras).
 */
export async function GET() {
  const user = await requireUser('owner')
  const shared = await isShared()
  const { name, bytes } = shared ? await exportTenant(user.tenant_id) : await makeBackup()
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': shared ? 'application/json' : 'application/gzip',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
