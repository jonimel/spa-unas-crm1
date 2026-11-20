import { z } from 'zod'

/**
 * Validación de lo que llega de formularios y acciones del servidor. Todo id que llega de afuera se revisa
 * antes de tocar la base: un valor alterado da un mensaje amable, no un error 500.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

/** El valor si es un uuid; si no, null (para filtros de la URL: un valor raro se ignora). */
export const uuidOrNull = (v: unknown) => (isUuid(v) ? v : null)

export const zUuid = z.string().regex(UUID_RE, 'id no válido')

/** Texto opcional: null, undefined o vacío → null; si no, recortado al máximo. */
export const zOptText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v.trim().slice(0, max) : ''))
    .transform((v) => v || null)

/** Para filtros LIKE / ILIKE: escapa los comodines % y _ (y la barra) del texto que escribe la persona. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)
