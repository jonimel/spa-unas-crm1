import { addDaysYmd, atLocal, todayYmd, weekdayOf } from './time'

export type PeriodKey = 'hoy' | 'semana' | 'semana-pasada' | 'mes' | 'mes-pasado'
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  hoy: 'Hoy',
  semana: 'Semana',
  'semana-pasada': 'Sem. pasada',
  mes: 'Mes',
  'mes-pasado': 'Mes pasado',
}

export type Period = { key: PeriodKey; from: string; to: string; start: Date; end: Date; days: number; label: string }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function short(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** Rango [from, to] en días locales (to incluido). La semana empieza el lunes. */
export function period(key: PeriodKey, tz: string, now = new Date()): Period {
  const today = todayYmd(tz, now)
  let from: string
  let to: string
  if (key === 'hoy') from = to = today
  else if (key === 'semana' || key === 'semana-pasada') {
    const back = (weekdayOf(today) + 6) % 7 // días desde el lunes
    from = addDaysYmd(today, -back - (key === 'semana-pasada' ? 7 : 0))
    to = addDaysYmd(from, 6)
  } else {
    const [y, m] = today.split('-').map(Number)
    const [yy, mm] = key === 'mes' ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1]
    from = `${yy}-${String(mm).padStart(2, '0')}-01`
    to = addDaysYmd(monthAfter(from), -1)
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1
  const label =
    key === 'hoy'
      ? `Hoy · ${short(from)}`
      : key === 'mes' || key === 'mes-pasado'
        ? cap(MONTHS_LONG[Number(from.slice(5, 7)) - 1]) + ' ' + from.slice(0, 4)
        : `${short(from)} – ${short(to)}`
  return { key, from, to, days, label, start: atLocal(from, 0, tz), end: atLocal(addDaysYmd(to, 1), 0, tz) }
}

export function monthAfter(ymdFirst: string) {
  const [y, m] = ymdFirst.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export function monthBefore(ymdFirst: string) {
  const [y, m] = ymdFirst.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
}

export function monthName(ymdFirst: string, long = true) {
  const m = Number(ymdFirst.slice(5, 7)) - 1
  return long ? cap(MONTHS_LONG[m]) : cap(MONTHS[m])
}

export function asPeriodKey(v: unknown, allowed: PeriodKey[], fallback: PeriodKey): PeriodKey {
  return allowed.includes(v as PeriodKey) ? (v as PeriodKey) : fallback
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
