import { atLocal, weekdayOf } from './time'

export type Interval = { start: Date; end: Date }
export type BarberDay = {
  id: string
  /** bloques de trabajo de ese día en esa sede, en minutos locales */
  hours: { start_min: number; end_min: number }[]
  /** citas activas y ausencias del barbero ese día */
  busy: Interval[]
}
export type Slot = { start: Date; end: Date; minutes: number; barberIds: string[] }

export type SlotInput = {
  ymd: string
  tz: string
  durationMin: number
  stepMin: number
  now: Date
  minNoticeMin: number
  barbers: BarberDay[]
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/**
 * Horas libres de un día: para cada hora (cada `stepMin`), qué barberos pueden atender
 * un servicio de `durationMin` completo sin cruzarse con otra cita y dentro de su horario.
 */
export function computeSlots(input: SlotInput): Slot[] {
  const { ymd, tz, durationMin, stepMin, now, minNoticeMin, barbers } = input
  const earliest = new Date(now.getTime() + minNoticeMin * 60_000)
  const byMinute = new Map<number, string[]>()

  for (const b of barbers) {
    for (const h of b.hours) {
      // alinear al paso desde la medianoche
      const first = Math.ceil(h.start_min / stepMin) * stepMin
      for (let m = first; m + durationMin <= h.end_min; m += stepMin) {
        const iv = { start: atLocal(ymd, m, tz), end: atLocal(ymd, m + durationMin, tz) }
        if (iv.start < earliest) continue
        if (b.busy.some((x) => overlaps(iv, x))) continue
        const list = byMinute.get(m) ?? []
        if (!list.includes(b.id)) list.push(b.id)
        byMinute.set(m, list)
      }
    }
  }

  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minutes, barberIds]) => ({
      minutes,
      barberIds,
      start: atLocal(ymd, minutes, tz),
      end: atLocal(ymd, minutes + durationMin, tz),
    }))
}

export { weekdayOf }
