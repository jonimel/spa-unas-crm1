import os from 'node:os'
import { DEMO } from './seed'

/** Direcciones IPv4 de este computador en la red local (Wi-Fi o cable). */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.family === 'IPv4')
    .map((i) => i!.address)
}

/** Muestra en la terminal el link para abrir la app desde el celular. */
export function printPhoneLinks(slug = DEMO.slug) {
  if (process.env.RAILWAY_ENVIRONMENT) return // en la nube no hay Wi-Fi local
  const port = process.env.PORT ?? '3000'
  const ips = lanAddresses()
  if (!ips.length) return
  console.log('\n📱 Desde el celular (conectado al mismo Wi-Fi):')
  for (const ip of ips) console.log(`   Reservas de clientes: http://${ip}:${port}/r/${slug}    ·    Equipo: http://${ip}:${port}/entrar`)
  console.log('')
}
