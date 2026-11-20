import os from 'node:os'
import type { NextConfig } from 'next'

// Direcciones de este computador en la red local (Wi-Fi/cable), p. ej. 192.168.1.25.
// En modo `npm run dev`, Next.js bloquea por seguridad las conexiones que no vienen de "localhost";
// sin esto, al abrir la app desde el celular la página se ve pero los botones no responden.
const lanHosts = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && !i.internal && i.family === 'IPv4')
  .map((i) => i!.address)

const nextConfig: NextConfig = {
  // la base de datos embebida (PGlite) se carga desde node_modules, sin empaquetar
  serverExternalPackages: ['@electric-sql/pglite'],
  allowedDevOrigins: [...new Set(['127.0.0.1', ...lanHosts, os.hostname().toLowerCase(), '*.local', '192.168.*.*', '10.*.*.*', '172.*.*.*'])],
}

export default nextConfig
