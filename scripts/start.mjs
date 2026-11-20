// Arranca la versión final (`next start`) apagándose bien.
// Next 16 sale con código 143 cuando recibe SIGTERM, y Railway lo toma como una caída ("Deploy Crashed")
// cada vez que se actualiza la app. Con NEXT_MANUAL_SIG_HANDLE el apagado lo hace src/instrumentation.ts:
// cierra la base de datos y sale con código 0. Funciona igual en Windows (npm start / npm run app).
import { createRequire } from 'node:module'

process.env.NEXT_MANUAL_SIG_HANDLE = '1'
process.argv = [process.argv[0], 'next', 'start', ...process.argv.slice(2)]
createRequire(import.meta.url)('next/dist/bin/next')
