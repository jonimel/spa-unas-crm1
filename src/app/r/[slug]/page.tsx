import { notFound } from 'next/navigation'
import { ShopMark } from '@/components/ShopLogo'
import { Icon } from '@/components/Icon'
import { bookingCatalog, spaWhatsApp, tenantBySlug } from '@/lib/booking'
import { waLink } from '@/lib/phone'
import { rows } from '@/lib/db'
import { BookingFlow } from './BookingFlow'

export async function generateMetadata({ params }: PageProps<'/r/[slug]'>) {
  const t = await tenantBySlug((await params).slug)
  return { title: t ? `Reserva · ${t.name}` : 'Reserva' }
}

export default async function BookingPage({ params }: PageProps<'/r/[slug]'>) {
  const { slug } = await params
  const t = await tenantBySlug(slug)
  if (!t) notFound()
  const { branches, services } = await bookingCatalog(t.id)
  const barbers = await rows<{ id: string; name: string; branch_ids: string[] }>(
    `select u.id, u.name, array_agg(distinct w.branch_id) as branch_ids
       from users u join working_hours w on w.barber_id = u.id
      where u.tenant_id = $1 and u.active and u.role = 'barber'
      group by u.id, u.name order by u.name`,
    [t.id],
  )
  if (barbers.length === 0) {
    const phone = await spaWhatsApp(t.id, branches[0]?.id)
    return (
      <main className="page">
        <div className="top">
          <div className="tt brand">
            <ShopMark size={38} slug={slug} name={t.name} />
            <div>
              <b>{t.name}</b>
              <span>{t.city}</span>
            </div>
          </div>
        </div>
        <div className="welcome" style={{ marginTop: 18 }}>
          <h2>
            Muy <em>pronto</em>
          </h2>
          <p>Estamos preparando nuestra agenda online. Mientras tanto, escríbenos por WhatsApp para reservar.</p>
        </div>
        {phone ? (
          <a className="btn wa" style={{ marginTop: 18 }} href={waLink(phone, `Hola, quiero reservar una cita en ${t.name}.`)} target="_blank" rel="noreferrer">
            <Icon name="wa" /> Escribir al spa por WhatsApp
          </a>
        ) : (
          <div className="empty" style={{ marginTop: 18 }}>
            Vuelve en unos días para reservar online.
          </div>
        )}
      </main>
    )
  }
  return <BookingFlow slug={slug} tenant={{ name: t.name, city: t.city }} branches={branches} services={services} barbers={barbers} />
}
