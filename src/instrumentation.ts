// Se ejecuta una vez al arrancar el servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Al actualizar, Railway apaga la versión anterior con SIGTERM. Sin esto el proceso salía con código 143
  // ("Deploy Crashed" en cada actualización) y la base se cerraba de golpe. Ahora se cierra la base con calma y sale bien.
  const { shutdown } = await import('./lib/db')
  let closing = false
  for (const sig of ['SIGTERM', 'SIGINT'] as const)
    process.once(sig, () => {
      if (closing) return
      closing = true
      const force = setTimeout(() => process.exit(0), 8_000)
      force.unref()
      void shutdown()
        .catch((e) => console.error('[spa] cerrar la base:', e))
        .finally(() => process.exit(0))
    })

  const { printPhoneLinks } = await import('./lib/lan')
  printPhoneLinks()

  // Revisa cada minuto los avisos al dueño y los recordatorios pendientes.
  const { runDueJobs } = await import('./lib/appointments')
  const tick = () => void runDueJobs()
  setTimeout(tick, 5_000)
  setInterval(tick, 60_000)

  // Demo (Spa Uñas Bella): cada hora completa la agenda de los días que vienen y cobra lo que ya pasó.
  const { getDb } = await import('./lib/db')
  const { topUpDemo } = await import('./lib/demo-fill')
  setInterval(() => void getDb().then((db) => topUpDemo(db)).catch((e) => console.error('[spa] demo:', e)), 60 * 60_000)

  // Copia de seguridad diaria en la carpeta backups/ (una por día, se guardan las últimas 14).
  const { dailyBackup } = await import('./lib/backup')
  const backup = () =>
    void dailyBackup()
      .then((r) => r && console.log(`💾 Copia de seguridad guardada: backups/${r.name}`))
      .catch((e) => console.error('No se pudo hacer la copia de seguridad:', e))
  setTimeout(backup, 30_000)
  setInterval(backup, 60 * 60_000)
}
