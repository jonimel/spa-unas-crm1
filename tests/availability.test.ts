import { describe, expect, it } from 'vitest'
import { computeSlots } from '@/lib/availability'
import { atLocal } from '@/lib/time'

const tz = 'America/Bogota'
const ymd = '2026-11-16' // lunes
const base = { ymd, tz, stepMin: 30, minNoticeMin: 60, now: new Date('2026-11-15T12:00:00Z') }

describe('computeSlots', () => {
  it('lists every half hour that fits the service inside the working block', () => {
    const s = computeSlots({ ...base, durationMin: 60, barbers: [{ id: 'a', hours: [{ start_min: 540, end_min: 660 }], busy: [] }] })
    expect(s.map((x) => x.minutes)).toEqual([540, 570, 600]) // 9:00, 9:30, 10:00 (10:00-11:00 cabe justo)
    expect(s[0].start.toISOString()).toBe('2026-11-16T14:00:00.000Z') // 9 a. m. en Bogotá = 14:00 UTC
  })

  it('shows which barbers are free at the same hour', () => {
    const s = computeSlots({
      ...base,
      durationMin: 30,
      barbers: [
        { id: 'a', hours: [{ start_min: 540, end_min: 600 }], busy: [] },
        { id: 'b', hours: [{ start_min: 540, end_min: 600 }], busy: [{ start: atLocal(ymd, 540, tz), end: atLocal(ymd, 570, tz) }] },
      ],
    })
    expect(s).toHaveLength(2)
    expect(s[0].barberIds).toEqual(['a'])
    expect(s[1].barberIds.sort()).toEqual(['a', 'b'])
  })

  it('blocks a slot whose service would run into an existing appointment', () => {
    const s = computeSlots({
      ...base,
      durationMin: 60,
      barbers: [{ id: 'a', hours: [{ start_min: 540, end_min: 720 }], busy: [{ start: atLocal(ymd, 630, tz), end: atLocal(ymd, 660, tz) }] }],
    })
    expect(s.map((x) => x.minutes)).toEqual([540, 570, 660])
  })

  it('respects the minimum notice for today', () => {
    const now = atLocal(ymd, 600, tz) // 10:00
    const s = computeSlots({ ...base, now, durationMin: 30, barbers: [{ id: 'a', hours: [{ start_min: 540, end_min: 780 }], busy: [] }] })
    expect(s[0].minutes).toBe(660) // 11:00 = ahora + 1 h
  })
})
