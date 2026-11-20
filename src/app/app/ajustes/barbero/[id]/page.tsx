import { notFound } from 'next/navigation'
import { PhoneInput } from '@/components/PhoneInput'
import { Flash, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { one, rows } from '@/lib/db'
import { saveBarber } from '../../../actions'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export default async function Barbero({ params, searchParams }: PageProps<'/app/ajustes/barbero/[id]'>) {
  const user = await requireUser('owner')
  const { id } = await params
  const sp = await searchParams
  const isNew = id === 'nuevo'
  const b = isNew
    ? null
    : await one<{ id: string; name: string; phone: string; branch_id: string | null; active: boolean }>(
        `select id, name, phone, branch_id, active from users where id = $1 and tenant_id = $2 and role = 'barber'`,
        [/^[0-9a-f-]{36}$/i.test(id) ? id : '00000000-0000-0000-0000-000000000000', user.tenant_id],
      )
  if (!isNew && !b) notFound()
  const branches = await rows<{ id: string; name: string }>('select id, name from branches where tenant_id = $1 and active order by sort', [user.tenant_id])
  const hours = b ? await rows<{ weekday: number; start_min: number; end_min: number }>('select weekday, start_min, end_min from working_hours where barber_id = $1 order by weekday, start_min', [b.id]) : []
  const block = (wd: number, i: number) => hours.filter((h) => h.weekday === wd)[i]
  const defaults = (wd: number, i: number) => (isNew && wd >= 1 && wd <= 6 ? (i === 0 ? [540, 780] : [840, wd === 6 ? 1080 : 1140]) : null)

  return (
    <main>
      <Top title={isNew ? 'Nuevo barbero' : b!.name} sub="Datos, acceso y horario" back="/app/ajustes" />
      <Flash err={sp.err as string} />
      <form action={saveBarber} className="stack" style={{ gap: 14, marginTop: 8 }}>
        <input type="hidden" name="id" value={b?.id ?? ''} />
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <div className="in">
            <input id="name" name="name" defaultValue={b?.name} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="phone">Celular (con este entra a la app)</label>
          <PhoneInput id="phone" name="phone" defaultValue={b?.phone ?? ''} keep={b?.phone ?? undefined} required />
        </div>
        <div className="field">
          <label htmlFor="pin">{isNew ? 'PIN de acceso (4 a 6 números)' : 'Nuevo PIN (déjalo vacío para no cambiarlo)'}</label>
          <div className="in">
            <input id="pin" name="pin" inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="off" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="branch">Sede</label>
          <div className="in">
            <select id="branch" name="branch" defaultValue={b?.branch_id ?? branches[0]?.id}>
              {branches.map((br) => (
                <option key={br.id} value={br.id}>
                  {br.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {b && (
          <label className="row small">
            <input type="checkbox" name="active" defaultChecked={b.active} /> Activo (aparece en reservas y puede entrar)
          </label>
        )}

        <div className="eyebrow" style={{ marginBottom: 0 }}>
          Horario semanal
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Dos bloques por día (por ejemplo mañana y tarde, con almuerzo en medio). Deja vacío el día que no trabaja.
        </p>
        <div>
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <div key={wd} className="hours-day">
              <b>{DAYS[wd]}</b>
              <div>
                {[0, 1].map((i) => {
                  const h = block(wd, i)
                  const d = defaults(wd, i)
                  const a = h ? hhmm(h.start_min) : d ? hhmm(d[0]) : ''
                  const z = h ? hhmm(h.end_min) : d ? hhmm(d[1]) : ''
                  return (
                    <div key={i} className="hours-row">
                      <input type="time" name={`h_${wd}_${i}_start`} defaultValue={a} aria-label={`${DAYS[wd]} bloque ${i + 1} desde`} />
                      <span>–</span>
                      <input type="time" name={`h_${wd}_${i}_end`} defaultValue={z} aria-label={`${DAYS[wd]} bloque ${i + 1} hasta`} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="cta">
          <button className="btn">Guardar</button>
        </div>
      </form>
    </main>
  )
}
