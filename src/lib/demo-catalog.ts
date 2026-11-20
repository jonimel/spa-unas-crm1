/**
 * Catálogo del spa de ejemplo (Spa Uñas Bella, Medellín): precios de un salón de uñas en pesos colombianos.
 * Lo usan los datos de ejemplo (seed) y la demo que se mantiene viva (demo-fill) para armar citas realistas
 * con varios servicios y adicionales.
 */

export type CatalogItem = {
  name: string
  description: string | null
  duration: number
  price: number
  addon?: boolean
  refillDays?: number
  /** manos, pies o uñas artificiales (para combinar servicios) */
  kind?: 'mani' | 'pedi' | 'set'
  /** qué tan pedido es (servicios principales) */
  weight?: number
}

export const DEMO_CATALOG: CatalogItem[] = [
  { name: 'Manicure semipermanente', description: 'Esmalte en gel que dura 2 a 3 semanas', duration: 60, price: 45000, refillDays: 15, kind: 'mani', weight: 30 },
  { name: 'Manicure tradicional', description: 'Limado, cutícula y esmaltado', duration: 45, price: 25000, kind: 'mani', weight: 12 },
  { name: 'Pedicure tradicional', description: 'Limado, cutícula y esmaltado', duration: 60, price: 35000, kind: 'pedi', weight: 10 },
  { name: 'Pedicure semipermanente', description: 'Esmalte en gel en los pies', duration: 75, price: 50000, refillDays: 21, kind: 'pedi', weight: 10 },
  { name: 'Pedicure spa', description: 'Exfoliación, mascarilla y masaje', duration: 90, price: 65000, kind: 'pedi', weight: 8 },
  { name: 'Uñas acrílicas', description: 'Set completo, forma y largo a elección', duration: 120, price: 110000, refillDays: 21, kind: 'set', weight: 8 },
  { name: 'Retoque de acrílico', description: 'Relleno del crecimiento', duration: 90, price: 75000, refillDays: 21, kind: 'set', weight: 8 },
  { name: 'Uñas en polygel', description: 'Más livianas que el acrílico', duration: 105, price: 100000, refillDays: 21, kind: 'set', weight: 6 },
  { name: 'Kapping en gel', description: 'Refuerzo sobre la uña natural', duration: 75, price: 60000, refillDays: 21, kind: 'mani', weight: 6 },
  { name: 'Press-on a la medida', description: 'Uñas listas, reutilizables', duration: 60, price: 60000, kind: 'set', weight: 2 },
  // adicionales: se eligen después de los servicios principales
  { name: 'Retiro de semipermanente', description: null, duration: 15, price: 8000, addon: true },
  { name: 'Retiro de acrílico o polygel', description: null, duration: 30, price: 20000, addon: true },
  { name: 'Nail art (por uña)', description: 'Diseño a mano, desde $5.000 por uña', duration: 15, price: 5000, addon: true },
  { name: 'Reparación de uña', description: 'Por uña', duration: 15, price: 7000, addon: true },
  { name: 'Parafina para manos', description: 'Hidratación profunda', duration: 15, price: 12000, addon: true },
]

type Svc = { name: string; is_addon: boolean }

/**
 * Arma los servicios de una visita: uno principal, a veces manos + pies, y adicionales que tienen sentido
 * (retiro antes del semipermanente, nail art…). Si el catálogo no es el de ejemplo, elige un servicio principal al azar.
 */
export function pickCombo<T extends Svc>(rnd: () => number, services: T[]): T[] {
  const by = (n: string) => services.find((s) => s.name === n)
  const mains = services.filter((s) => !s.is_addon)
  if (!mains.length) return []
  const known = DEMO_CATALOG.filter((c) => !c.addon && by(c.name))
  if (!known.length) return [mains[Math.floor(rnd() * mains.length)]]
  const weighted = (list: CatalogItem[]) => {
    const total = list.reduce((a, c) => a + (c.weight ?? 1), 0)
    let r = rnd() * total
    for (const c of list) if ((r -= c.weight ?? 1) < 0) return c
    return list[list.length - 1]
  }
  const first = weighted(known)
  const out: CatalogItem[] = [first]
  if (first.kind === 'mani' && rnd() < 0.3) out.push(weighted(known.filter((c) => c.kind === 'pedi')))
  else if (first.kind === 'pedi' && rnd() < 0.2) {
    const m = known.filter((c) => c.name === 'Manicure semipermanente' || c.name === 'Manicure tradicional')
    if (m.length) out.push(weighted(m))
  }
  const add = (n: string, p: number) => {
    if (rnd() < p && by(n)) out.push(DEMO_CATALOG.find((c) => c.name === n)!)
  }
  if (first.name === 'Manicure semipermanente' || first.name === 'Kapping en gel') add('Retiro de semipermanente', 0.4)
  if (first.name === 'Uñas acrílicas' || first.name === 'Uñas en polygel') add('Retiro de acrílico o polygel', 0.15)
  if (first.kind === 'mani' || first.kind === 'set') add('Nail art (por uña)', 0.25)
  add('Reparación de uña', 0.05)
  if (first.kind === 'mani') add('Parafina para manos', 0.06)
  return out.filter((c) => c).map((c) => by(c.name)!).filter(Boolean)
}
