// Restaura una copia de seguridad.  Uso (con el servidor apagado):
//   npm run restore                 → la copia más reciente de la carpeta backups/
//   npm run restore -- archivo.tar.gz
// La base de datos actual no se borra: se guarda en .data/pg-antes-de-restaurar-<fecha>.
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = process.cwd()
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH
const backups = process.env.SPA_BACKUP_DIR ?? process.env.BARBAR_BACKUP_DIR ?? (volume ? path.join(volume, 'backups') : path.join(root, 'backups'))
let file = process.argv[2]
if (!file) {
  const all = fs.existsSync(backups) ? fs.readdirSync(backups).filter((f) => /^(spa|barbar)-.*\.tar\.gz$/.test(f)).sort((a, b) => a.replace(/^\w+-/, '').localeCompare(b.replace(/^\w+-/, ''))) : []
  if (!all.length) {
    console.log('No hay copias en la carpeta backups/.')
    process.exit(1)
  }
  file = path.join(backups, all[all.length - 1])
}
if (!fs.existsSync(file)) {
  console.log(`No encuentro el archivo: ${file}`)
  process.exit(1)
}

const dataDir = process.env.SPA_DATA_DIR ?? process.env.BARBAR_DATA_DIR ?? (volume ? path.join(volume, 'pg') : path.join(root, '.data', 'pg'))
if (fs.existsSync(dataDir)) {
  const keep = path.join(path.dirname(dataDir), `pg-antes-de-restaurar-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`)
  try {
    fs.renameSync(dataDir, keep)
  } catch {
    console.log('No pude mover la base de datos actual. ¿Está corriendo el servidor? Ciérralo con Ctrl+C y vuelve a intentar.')
    process.exit(1)
  }
  console.log(`La base de datos actual quedó guardada en ${path.relative(root, keep)}`)
}
fs.mkdirSync(dataDir, { recursive: true })
const db = new PGlite(dataDir, { loadDataDir: new Blob([fs.readFileSync(file)]) })
const { rows } = await db.query('select count(*)::int n from appointments')
await db.close()
console.log(`Listo: restaurada ${path.basename(file)} (${rows[0].n} citas). Ahora arranca con npm run app o npm run dev.`)
