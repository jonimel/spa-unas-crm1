import { Avatar, Flash, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { fmtPhone } from '@/lib/phone'
import { changeMyPin, logoutAction } from '../actions'

export default async function Cuenta({ searchParams }: PageProps<'/app/cuenta'>) {
  const user = await requireUser()
  const sp = await searchParams
  return (
    <main>
      <Top title="Mi cuenta" sub={user.tenant_name} back={user.role === 'owner' ? '/app/ajustes' : undefined} />
      <Flash ok={sp.ok as string} err={sp.err as string} />
      <div className="card row" style={{ marginTop: 12 }}>
        <Avatar name={user.name} />
        <div className="grow">
          <b>{user.name}</b>
          <div className="small muted">
            {user.role === 'owner' ? 'Dueña / Administración' : 'Manicurista'} · {fmtPhone(user.phone)}
          </div>
        </div>
      </div>
      <div className="eyebrow">Cambiar PIN</div>
      <form action={changeMyPin} className="stack">
        <div className="field">
          <div className="in">
            <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" placeholder="Nuevo PIN (4 a 6 números)" aria-label="Nuevo PIN" required />
          </div>
        </div>
        <button className="btn sm">Guardar PIN</button>
      </form>
      <div className="eyebrow">Sesión</div>
      <form action={logoutAction}>
        <button className="btn ghost">Salir</button>
      </form>
    </main>
  )
}
