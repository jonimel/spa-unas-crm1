import { one, tx } from './db'
import { hashPin } from './pin'
import { normalizeCoPhone, PHONE_ERROR } from './phone'
import { BookingError } from './booking'

/** Servicios con los que arranca un spa nuevo (se cambian en Ajustes). */
export const STARTER_SERVICES = [
  { name: 'Manicure tradicional', description: 'Limado, cutícula y esmaltado', duration: 45, price: 25000, addon: false, refill: null },
  { name: 'Manicure semipermanente', description: 'Esmalte en gel que dura 2 a 3 semanas', duration: 60, price: 45000, addon: false, refill: 15 },
  { name: 'Pedicure tradicional', description: 'Limado, cutícula y esmaltado', duration: 60, price: 35000, addon: false, refill: null },
  { name: 'Uñas acrílicas', description: 'Set completo', duration: 120, price: 110000, addon: false, refill: 21 },
  { name: 'Retiro de semipermanente', description: null, duration: 15, price: 8000, addon: true, refill: null },
  { name: 'Nail art (por uña)', description: 'Diseño a mano, desde $5.000 por uña', duration: 15, price: 5000, addon: true, refill: null },
]

/** Freno a altas en serie (robots): como mucho estas spas nuevos por hora en todo el sistema. */
const MAX_PER_HOUR = 20

export function slugify(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'y')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'spa'
  )
}

export type NewShop = { shop: string; city: string; branch: string; address: string; owner: string; phone: string; pin: string; pin2: string }

/** Crea un spa con su sede, el dueño y unos servicios de arranque. Devuelve el id del dueño y el link. */
export async function createShop(input: NewShop) {
  const shop = input.shop.trim().replace(/\s+/g, ' ').slice(0, 60)
  const owner = input.owner.trim().replace(/\s+/g, ' ').slice(0, 60)
  const city = input.city.trim().slice(0, 60) || null
  const branch = input.branch.trim().slice(0, 60) || city || 'Principal'
  const address = input.address.trim().slice(0, 120) || null
  if (shop.length < 2) throw new BookingError('Escribe el nombre del spa')
  if (owner.length < 2) throw new BookingError('Escribe tu nombre')
  const phone = normalizeCoPhone(input.phone)
  if (!phone) throw new BookingError(PHONE_ERROR)
  if (!/^\d{4,6}$/.test(input.pin)) throw new BookingError('El PIN son 4 a 6 números')
  if (input.pin !== input.pin2) throw new BookingError('Los dos PIN no son iguales')

  return tx(async (on) => {
    // un celular entra a un solo spa (al entrar solo se escribe celular + PIN)
    if (await one('select 1 from users where phone = $1', [phone], on))
      throw new BookingError('Ese celular ya tiene cuenta. Entra con él, o usa otro celular.')
    const recent = await one<{ n: number }>(`select count(*)::int n from tenants where created_at > now() - interval '1 hour'`, [], on)
    if (recent!.n >= MAX_PER_HOUR) throw new BookingError('Hay muchos spas nuevos en este momento. Intenta de nuevo en un rato.')

    const base = slugify(shop)
    let slug = base
    for (let i = 2; await one('select 1 from tenants where slug = $1', [slug], on); i++) slug = `${base}-${i}`

    const t = (await one<{ id: string }>(`insert into tenants (slug, name, city) values ($1, $2, $3) returning id`, [slug, shop, city], on))!
    await one(`insert into branches (tenant_id, name, address, sort) values ($1, $2, $3, 0)`, [t.id, branch, address], on)
    const u = (await one<{ id: string }>(
      `insert into users (tenant_id, role, name, phone, pin_hash) values ($1, 'owner', $2, $3, $4) returning id`,
      [t.id, owner, phone, hashPin(input.pin)],
      on,
    ))!
    for (const [i, s] of STARTER_SERVICES.entries())
      await one(
        `insert into services (tenant_id, name, description, duration_min, price, sort, is_addon, refill_days) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [t.id, s.name, s.description, s.duration, s.price, i, s.addon, s.refill],
        on,
      )
    return { tenantId: t.id, ownerId: u.id, slug }
  })
}
