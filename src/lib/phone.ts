/** Celular colombiano: 10 dígitos que empiezan por 3. Acepta "+57 310 482 7719", "3104827719", etc. */
export function normalizeCoPhone(input: string): string | null {
  let d = (input ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return /^3\d{9}$/.test(d) ? d : null
}

export const PHONE_ERROR = 'Número de celular no válido: son 10 dígitos y empieza por 3.'

/** Código corto de 4 dígitos: solo para entrar con los usuarios de prueba (3000, 4000…). */
export const isShortCode = (digits: string) => /^\d{4}$/.test(digits)

/** Lo que se acepta en "Entrar": un celular, o un código corto de prueba. */
export function normalizeLoginPhone(input: string): string | null {
  const d = (input ?? '').replace(/\D/g, '')
  return normalizeCoPhone(input) ?? (isShortCode(d) ? d : null)
}

export function fmtPhone(p: string | null | undefined) {
  if (!p) return ''
  return p.length === 10 ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''))).toUpperCase()
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}
