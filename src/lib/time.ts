import { TZDate } from '@date-fns/tz'

/** Fecha local "YYYY-MM-DD" + minutos desde medianoche → instante real (Date). */
export function atLocal(ymd: string, minutes: number, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, tz)
  return new Date(t.getTime())
}

/** Partes locales de un instante en la zona horaria de la barbería. */
export function localParts(date: Date, tz: string) {
  const t = new TZDate(date.getTime(), tz)
  const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  return { ymd, weekday: t.getDay(), minutes: t.getHours() * 60 + t.getMinutes() }
}

export function todayYmd(tz: string, now = new Date()) {
  return localParts(now, tz).ymd
}

export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// ---------- formato (es-CO) ----------

export function fmtTime(date: Date, tz: string) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
}

export function fmtDay(date: Date, tz: string) {
  const s = new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(date)
  return cap(s.replace(/\./g, '').replace(',', ''))
}

export function fmtDayLong(date: Date, tz: string) {
  const s = new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return cap(s.replace(',', ''))
}

export function fmtYmdShort(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  const wd = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', weekday: 'short' }).format(dt).replace('.', '')
  const mo = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'short' }).format(dt).replace('.', '')
  return { wd: cap(wd), day: d, mo }
}

/** "lun 9 nov" */
export function fmtDayShort(ymd: string) {
  const f = fmtYmdShort(ymd)
  return `${f.wd.toLowerCase()} ${f.day} ${f.mo}`
}

/** "1 visita", "3 visitas". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function fmtMoney(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')
}

export function fmtDuration(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
