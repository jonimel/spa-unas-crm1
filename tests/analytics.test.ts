import { describe, expect, it } from 'vitest'
import { ranges } from '@/lib/analytics'
import { plural } from '@/lib/time'

const TZ = 'America/Bogota'
const SAT_2PM = new Date('2026-11-14T19:00:00Z') // sábado 14 nov, 2 p. m. en Bogotá

describe('periodos del análisis', () => {
  it('compara hoy con el mismo día de la semana pasada, hasta la misma hora', () => {
    const r = ranges('hoy', TZ, '2026-11-01', SAT_2PM)
    expect(r).toMatchObject({ from: '2026-11-14', to: '2026-11-14', prevFrom: '2026-11-07', prevTo: '2026-11-07', cut: true })
    expect(r.vs).toBe('el sábado pasado a esta hora')
    expect(ranges('hoy', TZ, '2026-11-01', new Date('2026-11-16T15:00:00Z')).vs).toBe('el lunes pasado a esta hora')
  })

  it('la semana en curso contra la semana pasada a la misma altura', () => {
    expect(ranges('semana', TZ, '2026-11-01', SAT_2PM)).toMatchObject({ from: '2026-11-09', to: '2026-11-14', prevFrom: '2026-11-02', prevTo: '2026-11-07', cut: true })
  })

  it('el mes en curso contra los mismos días del anterior; un mes cerrado se compara completo', () => {
    expect(ranges('mes', TZ, '2026-11-01', SAT_2PM)).toMatchObject({ from: '2026-11-01', to: '2026-11-14', prevFrom: '2026-10-01', prevTo: '2026-10-14', cut: true })
    expect(ranges('mes', TZ, '2026-10-01', SAT_2PM)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', prevFrom: '2026-09-01', prevTo: '2026-09-30', cut: false, isCurrent: false })
  })

  it('el 31 de marzo se compara con febrero completo', () => {
    expect(ranges('mes', TZ, '2027-03-01', new Date('2027-03-31T19:00:00Z'))).toMatchObject({ prevFrom: '2027-02-01', prevTo: '2027-02-28', cut: false })
  })

  it('singular y plural', () => {
    expect(plural(1, 'visita', 'visitas')).toBe('1 visita')
    expect(plural(3, 'visita', 'visitas')).toBe('3 visitas')
  })
})
