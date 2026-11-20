import { notFound } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, METHOD_LABEL, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { PAY_METHODS } from '@/lib/appointments'
import { apptView } from '@/lib/booking'
import { fmtMoney } from '@/lib/time'
import { checkoutAction } from '../../actions'

const UUID = /^[0-9a-f-]{36}$/i
const METHOD_ICON: Record<string, string> = { efectivo: 'cash', nequi: 'phone', daviplata: 'phone', tarjeta: 'card', transferencia: 'link' }

export default async function Cobrar({ params, searchParams }: PageProps<'/app/cobrar/[id]'>) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  if (!UUID.test(id)) notFound()
  const a = await apptView(id)
  if (!a || a.tenant_id !== user.tenant_id || (user.role !== 'owner' && a.barber_id !== user.id)) notFound()

  return (
    <main>
      <Top title="Cobrar visita" sub={`${a.client_name} · ${a.time}`} back={`/app/cita/${id}`} />
      <Flash ok={sp.ok as string} err={sp.err as string} />
      {a.status === 'completed' ? (
        <div className="empty" style={{ marginTop: 16 }}>
          Esta visita ya fue cobrada{a.paid_amount !== null ? `: ${fmtMoney(a.paid_amount + (a.paid_tip ?? 0))}` : ''}.
        </div>
      ) : (
        <form action={checkoutAction}>
          <input type="hidden" name="id" value={id} />
          {a.client_allergies && (
            <div className="alert-allergy" role="note" style={{ marginTop: 12 }}>
              <Icon name="alert" />
              <div>
                <b>Alergias y sensibilidades</b>
                {a.client_allergies}
              </div>
            </div>
          )}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row">
              <Avatar name={a.client_name} />
              <div className="grow">
                <b>{a.client_name}</b>
                <div className="small muted">
                  {a.barber_name} · {a.branch_name}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {a.lines.map((l, i) => (
                <div className="kv" key={i}>
                  <span>
                    {l.is_addon ? '+ ' : ''}
                    {l.name}
                  </span>
                  <span className="num">{fmtMoney(l.price)}</span>
                </div>
              ))}
              {a.lines.length > 1 && (
                <div className="kv">
                  <b>Total</b>
                  <b className="num">{fmtMoney(a.price)}</b>
                </div>
              )}
            </div>
          </div>

          <div className="eyebrow">{a.lines.length > 1 ? 'Valor de los servicios' : 'Valor del servicio'}</div>
          <label className="big-in" htmlFor="amount">
            <b>$</b>
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              data-money=""
              defaultValue={a.price.toLocaleString('es-CO').replace(/,/g, '.')}
              style={{ background: 'none', border: 0, outline: 0, fontFamily: 'var(--f-display)', fontSize: 40, color: 'var(--brass)', width: '100%' }}
              aria-label="Valor"
            />
          </label>

          <div className="eyebrow">Propina</div>
          <div className="chips">
            {[0, 2000, 5000, 10000].map((v) => (
              <label key={v} className="chip">
                <input type="radio" name="tip" value={v} defaultChecked={v === 0} />
                {v === 0 ? 'Sin propina' : fmtMoney(v)}
              </label>
            ))}
          </div>

          <div className="eyebrow">Medio de pago</div>
          <div className="pay">
            {PAY_METHODS.map((m, i) => (
              <label key={m}>
                <input type="radio" name="method" value={m} defaultChecked={i === 0} />
                <Icon name={METHOD_ICON[m]} />
                {METHOD_LABEL[m]}
              </label>
            ))}
          </div>

          <div className="cta">
            <button className="btn" type="submit">
              <Icon name="check" /> Registrar pago
            </button>
          </div>
        </form>
      )}
    </main>
  )
}
