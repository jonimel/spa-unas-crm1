import { notFound, redirect } from 'next/navigation'
import { bookingCatalog, tenantBySlug } from '@/lib/booking'
import { rows } from '@/lib/db'
import { DEMO } from '@/lib/seed'
import { BookingFlow } from './BookingFlow'

export async function generateMetadata({ params }: PageProps<'/r/[slug]'>) {
  const t = await tenantBySlug((await params).slug)
  return { title: t ? `Reserva · ${t.name}` : 'Reserva' }
}

export default async function BookingPage({ params }: PageProps<'/r/[slug]'>) {
  const { slug } = await params
  const t = await tenantBySlug(slug)
  if (!t && slug === DEMO.oldSlug && (await tenantBySlug(DEMO.slug))) redirect(`/r/${DEMO.slug}`)
  if (!t) notFound()
  const { branches, services } = await bookingCatalog(t.id)
  const barbers = await rows<{ id: string; name: string; branch_ids: string[] }>(
    `select u.id, u.name, array_agg(distinct w.branch_id) as branch_ids
       from users u join working_hours w on w.barber_id = u.id
      where u.tenant_id = $1 and u.active and u.role = 'barber'
      group by u.id, u.name order by u.name`,
    [t.id],
  )
  return <BookingFlow slug={slug} tenant={{ name: t.name, city: t.city }} branches={branches} services={services} barbers={barbers} />
}
