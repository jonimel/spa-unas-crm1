import Link from 'next/link'
import { Flash, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { bookingCatalog } from '@/lib/booking'
import { rows } from '@/lib/db'
import { localParts, todayYmd } from '@/lib/time'
import { newAppointmentAction } from '../actions'
import { NuevaForm } from './NuevaForm'

export default async function Nueva({ searchParams }: PageProps<'/app/nueva'>) {
  const user = await requireUser()
  const sp = await searchParams
  const { services } = await bookingCatalog(user.tenant_id)
  const barbers =
    user.role === 'owner'
      ? await rows<{ id: string; name: string; branch: string | null }>(
          `select u.id, u.name, b.name branch from users u left join branches b on b.id = u.branch_id where u.tenant_id = $1 and (u.role = 'barber' or u.serves) and u.active order by (u.role = 'owner') desc, u.name`,
          [user.tenant_id],
        )
      : []
  // hora sugerida: el próximo cuarto de hora (p. ej. 8:51 → 9:00)
  const { minutes } = localParts(new Date(), user.timezone)
  const next = Math.min(Math.ceil(minutes / 15) * 15, 23 * 60 + 45)
  const hh = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`

  return (
    <main>
      <Top title="Nueva cita" sub="Clienta de paso o cita por teléfono" back="/app/agenda" />
      <Flash err={sp.err as string} />
      {user.role === 'owner' && barbers.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          Todavía no hay quién atienda: agrega una manicurista (o marca “Yo también atiendo”) para poder agendar.
          <div
            className="row"
            style={{
              gap: 8,
              marginTop: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link className="btn sm" href="/app/ajustes/manicurista/nuevo">
              Agregar manicurista
            </Link>
            <Link className="btn ghost sm" href={`/app/ajustes/manicurista/${user.id}`}>
              Yo también atiendo
            </Link>
          </div>
        </div>
      ) : (
        <NuevaForm
          action={newAppointmentAction}
          services={services}
          barbers={barbers}
          isOwner={user.role === 'owner'}
          today={todayYmd(user.timezone)}
          hh={hh}
        />
      )}
    </main>
  )
}
