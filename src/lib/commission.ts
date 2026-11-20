/** Cálculo de comisiones (puro, sin base de datos). */

export type PayModel = 'percent' | 'fixed' | 'rent'
export type Rate = { kind: 'percent' | 'fixed'; value: number }

export type Scheme = {
  model: PayModel
  percent: number | null // null = por defecto de la barbería
  rentAmount: number | null
  rentPeriod: 'daily' | 'weekly' | 'monthly' | null
  rentSince?: string | null // YYYY-MM-DD: desde cuándo corre el arriendo
  rates: Record<string, Rate> // por service_id
}

export type ShopRules = {
  defaultPct: number
  tipsToBarber: boolean
  deductCardFee: boolean
  cardFeePct: number
}

export type Share = { barberShare: number; barberTip: number; shopShare: number; rule: string }

/** Regla guardada en los cobros de un barbero de silla: esa plata ya es suya, no entra en lo que se le debe. */
export const RENT_RULE = 'Arriendo de silla: 100% para el barbero'

/** Pagos a barberos: tipos y medios. */
export type PayoutKind = 'pago' | 'adelanto' | 'arriendo'
export const PAYOUT_KIND_LABEL: Record<PayoutKind, string> = { pago: 'Pago', adelanto: 'Adelanto', arriendo: 'Arriendo' }
export const PAYOUT_METHODS = ['efectivo', 'nequi', 'daviplata', 'transferencia'] as const

const pctLabel = (n: number) => `${Number(n.toFixed(2))}%`
const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')

export function computeShare(
  p: { amount: number; tip: number; method: string; serviceId: string | null },
  scheme: Scheme | null,
  shop: ShopRules,
): Share {
  const amount = Math.max(0, Math.round(p.amount))
  const tip = Math.max(0, Math.round(p.tip))
  const barberTip = shop.tipsToBarber ? tip : 0
  const fee = shop.deductCardFee && p.method === 'tarjeta' ? shop.cardFeePct / 100 : 0
  const base = amount * (1 - fee)
  const feeNote = fee ? ` (menos ${pctLabel(shop.cardFeePct)} datáfono)` : ''
  const s = scheme ?? { model: 'percent' as const, percent: null, rentAmount: null, rentPeriod: null, rates: {} }
  const rate = p.serviceId ? s.rates[p.serviceId] : undefined

  let barberShare: number
  let rule: string
  if (s.model === 'rent') {
    barberShare = amount
    rule = RENT_RULE
  } else if (rate?.kind === 'fixed') {
    barberShare = Math.min(rate.value, amount)
    rule = `Fijo ${money(rate.value)}`
  } else if (rate?.kind === 'percent') {
    barberShare = (base * rate.value) / 100
    rule = `${pctLabel(rate.value)} (especial)${feeNote}`
  } else {
    // modelo fijo sin monto para este servicio → cae al porcentaje
    const pct = s.percent ?? shop.defaultPct
    barberShare = (base * pct) / 100
    rule = `${pctLabel(pct)}${s.percent === null ? ' por defecto' : ''}${feeNote}`
  }
  barberShare = Math.round(barberShare)
  return { barberShare, barberTip, shopShare: amount + tip - barberShare - barberTip, rule }
}

/** Arriendo de un periodo: el valor exacto si coincide con la unidad (semanal en una semana, mensual en un mes); si no, proporcional a los días. */
export function rentForPeriod(amount: number, unit: 'daily' | 'weekly' | 'monthly', span: 'day' | 'week' | 'month', days: number) {
  if ((unit === 'weekly' && span === 'week') || (unit === 'monthly' && span === 'month')) return Math.round(amount)
  return rentForDays(amount, unit, days)
}

/**
 * Cuántos periodos de arriendo han empezado desde `since` hasta `today`, ambos incluidos.
 * El arriendo se paga por periodo empezado (por adelantado): semanal desde el día `since`, cada 7 días.
 */
export function rentPeriodsStarted(since: string, today: string, unit: 'daily' | 'weekly' | 'monthly') {
  if (today < since) return 0
  const days = Math.round((Date.parse(today) - Date.parse(since)) / 864e5)
  if (unit === 'daily') return days + 1
  if (unit === 'weekly') return Math.floor(days / 7) + 1
  const [y1, m1, d1] = since.split('-').map(Number)
  const [y2, m2, d2] = today.split('-').map(Number)
  // un arriendo que empezó el 31 se renueva el último día de los meses más cortos
  const lastDay = new Date(Date.UTC(y2, m2, 0)).getUTCDate()
  return (y2 - y1) * 12 + (m2 - m1) + (d2 >= Math.min(d1, lastDay) ? 1 : 0)
}

/** Arriendo que corresponde a un periodo de `days` días. */
export function rentForDays(amount: number, period: 'daily' | 'weekly' | 'monthly', days: number) {
  const perDay = period === 'daily' ? amount : period === 'weekly' ? amount / 7 : amount / 30
  return Math.round(perDay * days)
}

export function schemeSummary(s: Scheme | null, shop: ShopRules): { main: string; extra: string | null; kind: 'brass' | 'dim' | 'ok' } {
  if (!s || (s.model === 'percent' && s.percent === null && !Object.keys(s.rates).length))
    return { main: `${pctLabel(shop.defaultPct)} · comisión por defecto`, extra: null, kind: 'dim' }
  if (s.model === 'rent') {
    const per = { daily: 'día', weekly: 'semana', monthly: 'mes' }[s.rentPeriod ?? 'weekly']
    return { main: `Arriendo de silla · ${money(s.rentAmount ?? 0)}/${per}`, extra: null, kind: 'ok' }
  }
  const n = Object.keys(s.rates).length
  if (s.model === 'fixed') return { main: 'Monto fijo por servicio', extra: n === 1 ? '1 servicio' : `${n} servicios`, kind: 'brass' }
  return { main: `${pctLabel(s.percent ?? shop.defaultPct)} general`, extra: n ? `${n} ${n === 1 ? 'excepción' : 'excepciones'}` : null, kind: 'brass' }
}
