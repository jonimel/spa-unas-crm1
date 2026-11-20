import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  const h = scryptSync(pin, salt, 32).toString('hex')
  return `${salt}:${h}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, h] = stored.split(':')
  if (!salt || !h) return false
  const got = scryptSync(pin, salt, 32)
  const want = Buffer.from(h, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}
