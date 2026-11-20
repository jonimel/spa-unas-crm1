import os from 'node:os'

/**
 * Dirección con la que se arman los links (reservas, entrada del equipo, WhatsApp).
 * 1. PUBLIC_URL, o el dominio de Railway.
 * 2. Si no hay: la dirección con la que se abrió la app por última vez desde el computador o la red local
 *    (así el link sirve desde el celular), o la IP de este computador en la red local.
 * Nunca se toma un host público que venga en la petición (alguien podría falsearlo).
 */

const g = globalThis as unknown as { __spaBase?: string }

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d{1,5})?$/i

export function configuredBase() {
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  return (process.env.PUBLIC_URL || railway || '').replace(/\/+$/, '') || null
}

export function publicBase() {
  const fixed = configuredBase()
  if (fixed) return fixed
  if (g.__spaBase) return g.__spaBase
  const port = process.env.PORT ?? '3000'
  const ip = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && !i.internal && i.family === 'IPv4')?.address
  return `http://${ip ?? 'localhost'}:${port}`
}

/** Recuerda el host de esta petición si es local (localhost o la red de la casa). */
export function rememberHost(host: string | null | undefined) {
  if (configuredBase() || !host) return
  const h = host.trim()
  if (PRIVATE_HOST.test(h)) g.__spaBase = `http://${h}`
}
