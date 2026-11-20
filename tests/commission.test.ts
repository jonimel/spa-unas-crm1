import { describe, expect, it } from 'vitest'
import { computeShare, rentForDays, rentForPeriod, type Scheme, type ShopRules } from '@/lib/commission'
import { period } from '@/lib/periods'

const shop: ShopRules = { defaultPct: 45, tipsToBarber: true, deductCardFee: false, cardFeePct: 3 }
const andres: Scheme = { model: 'percent', percent: 50, rentAmount: null, rentPeriod: null, rates: { cb: { kind: 'percent', value: 55 }, cejas: { kind: 'fixed', value: 5000 } } }

describe('computeShare', () => {
  it('uses the shop default when the barber has no scheme', () => {
    const s = computeShare({ amount: 30000, tip: 0, method: 'efectivo', serviceId: 'corte' }, null, shop)
    expect(s.barberShare).toBe(13500)
    expect(s.shopShare).toBe(16500)
    expect(s.rule).toBe('45% por defecto')
  })

  it('applies the barber percent, per-service percent and fixed exceptions', () => {
    expect(computeShare({ amount: 30000, tip: 0, method: 'efectivo', serviceId: 'corte' }, andres, shop).barberShare).toBe(15000)
    expect(computeShare({ amount: 45000, tip: 0, method: 'efectivo', serviceId: 'cb' }, andres, shop).barberShare).toBe(24750)
    expect(computeShare({ amount: 10000, tip: 0, method: 'efectivo', serviceId: 'cejas' }, andres, shop)).toMatchObject({ barberShare: 5000, rule: 'Fijo $5.000' })
  })

  it('gives tips to the barber, or to the shop when the rule says so', () => {
    const a = computeShare({ amount: 30000, tip: 5000, method: 'nequi', serviceId: 'corte' }, andres, shop)
    expect(a).toMatchObject({ barberShare: 15000, barberTip: 5000, shopShare: 15000 })
    const b = computeShare({ amount: 30000, tip: 5000, method: 'nequi', serviceId: 'corte' }, andres, { ...shop, tipsToBarber: false })
    expect(b).toMatchObject({ barberTip: 0, shopShare: 20000 })
  })

  it('can discount the card fee before the percent', () => {
    const s = computeShare({ amount: 30000, tip: 0, method: 'tarjeta', serviceId: 'corte' }, andres, { ...shop, deductCardFee: true })
    expect(s.barberShare).toBe(14550) // 50% de 29.100
  })

  it('chair rent: the barber keeps 100%', () => {
    const rent: Scheme = { model: 'rent', percent: null, rentAmount: 350000, rentPeriod: 'weekly', rates: {} }
    expect(computeShare({ amount: 45000, tip: 2000, method: 'efectivo', serviceId: 'cb' }, rent, shop)).toMatchObject({ barberShare: 45000, barberTip: 2000, shopShare: 0 })
    expect(rentForDays(350000, 'weekly', 7)).toBe(350000)
    expect(rentForDays(350000, 'weekly', 30)).toBe(1500000)
    // un arriendo mensual en un mes de 31 días sigue siendo el valor del mes
    expect(rentForPeriod(1200000, 'monthly', 'month', 31)).toBe(1200000)
    expect(rentForPeriod(350000, 'weekly', 'week', 7)).toBe(350000)
    expect(rentForPeriod(350000, 'weekly', 'month', 30)).toBe(1500000)
  })
})

describe('period', () => {
  it('weeks start on Monday and months are calendar months', () => {
    const now = new Date('2026-11-14T15:00:00Z') // sábado 14 nov en Bogotá
    expect(period('semana', 'America/Bogota', now)).toMatchObject({ from: '2026-11-09', to: '2026-11-15', days: 7 })
    expect(period('semana-pasada', 'America/Bogota', now)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(period('mes', 'America/Bogota', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-30', days: 30 })
    expect(period('mes-pasado', 'America/Bogota', now)).toMatchObject({ from: '2026-10-01', to: '2026-10-31', days: 31 })
  })
})
