import { one, tx } from './db'
import { hashPin } from './pin'
import { normalizeCoPhone, PHONE_ERROR } from './phone'
import { BookingError } from './booking'

/** Servicios con los que arranca una barbería nueva (se cambian en Ajustes). */
export const STARTER_SERVICES = [
  { name: 'Corte clásico', description: 'Tijera o máquina', duration: 40, price: 30000 },
  { name: 'Corte + barba', description: null, duration: 60, price: 45000 },
  { name: 'Barba', description: 'Perfilado y navaja', duration: 30, price: 20000 },
]

/** Freno a altas en serie (robots): como mucho estas barberías nuevas por hora en todo el sistema. */
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
      .replace(/-+$/g, '') || 'barberia'
  )
}

export type NewShop = { shop: string; city: string; branch: string; address: string; owner: string; phone: string; pin: string; pin2: string }

/** Crea una barbería con su sede, el dueño y unos servicios de arranque. Devuelve el id del dueño y el link. */
export async function createShop(input: NewShop) {
  const shop = input.shop.trim().replace(/\s+/g, ' ').slice(0, 60)
  const owner = input.owner.trim().replace(/\s+/g, ' ').slice(0, 60)
  const city = input.city.trim().slice(0, 60) || null
  const branch = input.branch.trim().slice(0, 60) || city || 'Principal'
  const address = input.address.trim().slice(0, 120) || null
  if (shop.length < 2) throw new BookingError('Escribe el nombre de la barbería')
  if (owner.length < 2) throw new BookingError('Escribe tu nombre')
  const phone = normalizeCoPhone(input.phone)
  if (!phone) throw new BookingError(PHONE_ERROR)
  if (!/^\d{4,6}$/.test(input.pin)) throw new BookingError('El PIN son 4 a 6 números')
  if (input.pin !== input.pin2) throw new BookingError('Los dos PIN no son iguales')

  return tx(async (on) => {
    // un celular entra a una sola barbería (al entrar solo se escribe celular + PIN)
    if (await one('select 1 from users where phone = $1', [phone], on))
      throw new BookingError('Ese celular ya tiene cuenta. Entra con él, o usa otro celular.')
    const recent = await one<{ n: number }>(`select count(*)::int n from tenants where created_at > now() - interval '1 hour'`, [], on)
    if (recent!.n >= MAX_PER_HOUR) throw new BookingError('Hay muchas barberías nuevas en este momento. Intenta de nuevo en un rato.')

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
      await one(`insert into services (tenant_id, name, description, duration_min, price, sort) values ($1,$2,$3,$4,$5,$6)`, [t.id, s.name, s.description, s.duration, s.price, i], on)
    return { tenantId: t.id, ownerId: u.id, slug }
  })
}
