import { Icon } from '@/components/Icon'
import { PhoneInput } from '@/components/PhoneInput'
import { Flash, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { bookingCatalog } from '@/lib/booking'
import { rows } from '@/lib/db'
import { fmtDuration, fmtMoney, localParts, todayYmd } from '@/lib/time'
import { newAppointmentAction } from '../actions'

export default async function Nueva({ searchParams }: PageProps<'/app/nueva'>) {
  const user = await requireUser()
  const sp = await searchParams
  const { services } = await bookingCatalog(user.tenant_id)
  const barbers =
    user.role === 'owner'
      ? await rows<{ id: string; name: string; branch: string | null }>(
          `select u.id, u.name, b.name branch from users u left join branches b on b.id = u.branch_id where u.tenant_id = $1 and u.role = 'barber' and u.active order by u.name`,
          [user.tenant_id],
        )
      : []
  // hora sugerida: el próximo cuarto de hora (p. ej. 8:51 → 9:00)
  const { minutes } = localParts(new Date(), user.timezone)
  const next = Math.min(Math.ceil(minutes / 15) * 15, 23 * 60 + 45)
  const hh = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`

  return (
    <main>
      <Top title="Nueva cita" sub="Cliente de paso o cita por teléfono" back="/app/agenda" />
      <Flash err={sp.err as string} />
      <form action={newAppointmentAction} className="stack" style={{ gap: 14, marginTop: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 0 }}>
          ¿Cuándo?
        </div>
        <div className="seg">
          <label>
            <input type="radio" name="when" value="now" defaultChecked />
            <span>
              <Icon name="walk" /> Ahora (de paso)
            </span>
          </label>
          <label>
            <input type="radio" name="when" value="later" />
            <span>
              <Icon name="cal" /> Otro día / hora
            </span>
          </label>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="date">Día</label>
            <div className="in">
              <input id="date" name="date" type="date" defaultValue={todayYmd(user.timezone)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="time">Hora</label>
            <div className="in">
              <input id="time" name="time" type="time" defaultValue={hh} />
            </div>
          </div>
        </div>
        <p className="small muted" style={{ margin: '-6px 2px 0' }}>
          Día y hora solo aplican si eliges “Otro día / hora”.
        </p>

        {user.role === 'owner' && (
          <div className="field">
            <label htmlFor="barber">Barbero</label>
            <div className="in">
              <select id="barber" name="barber" required>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.branch ? ` · ${b.branch}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="eyebrow" style={{ marginBottom: 0 }}>
          Servicio
        </div>
        <div className="stack">
          {services.map((s, i) => (
            <label key={s.id} className="opt">
              <input type="radio" name="service" value={s.id} defaultChecked={i === 0} />
              <span className="grow">
                <div className="t">{s.name}</div>
                <div className="d">{fmtDuration(s.duration_min)}</div>
              </span>
              <span className="price">{fmtMoney(s.price)}</span>
            </label>
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 0 }}>
          Cliente
        </div>
        <div className="field">
          <label htmlFor="phone">Celular (opcional)</label>
          <PhoneInput id="phone" name="phone" placeholder="Si ya es cliente, lo reconocemos" />
        </div>
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <div className="in">
            <input id="name" name="name" placeholder="Opcional si pusiste el celular" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">Nota (opcional)</label>
          <div className="in">
            <input id="note" name="note" />
          </div>
        </div>
        <div className="cta">
          <button className="btn" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </main>
  )
}
