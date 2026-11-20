import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar, Flash, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { isShared, listBackups } from '@/lib/backup'
import { bookingLink, staffLoginLink } from '@/lib/booking'
import { rows } from '@/lib/db'
import { fmtPhone } from '@/lib/phone'
import { fmtMoney } from '@/lib/time'
import { closeBranch, logoutAction, reopenBranch, saveBranch, saveService } from '../actions'

export default async function Ajustes({ searchParams }: PageProps<'/app/ajustes'>) {
  const user = await requireUser('owner')
  const sp = await searchParams
  const services = await rows<{ id: string; name: string; description: string | null; duration_min: number; price: number; active: boolean }>(
    'select id, name, description, duration_min, price, active from services where tenant_id = $1 order by sort, name',
    [user.tenant_id],
  )
  const allBranches = await rows<{ id: string; name: string; address: string | null; active: boolean }>(
    'select id, name, address, active from branches where tenant_id = $1 order by sort',
    [user.tenant_id],
  )
  const branches = allBranches.filter((b) => b.active)
  const shared = await isShared()
  const last = listBackups()[0]
  const lastBackup = last?.replace(/^barbar-(\d{4})-(\d\d)-(\d\d)_(\d\d)(\d\d)\.tar\.gz$/, '$3/$2/$1 $4:$5')
  const closed = allBranches.filter((b) => !b.active)
  const barbers = await rows<{ id: string; name: string; phone: string; active: boolean; branch: string | null }>(
    `select u.id, u.name, u.phone, u.active, b.name branch from users u left join branches b on b.id = u.branch_id
      where u.tenant_id = $1 and u.role = 'barber' order by u.active desc, u.name`,
    [user.tenant_id],
  )
  const link = bookingLink(user.tenant_slug)
  const teamLink = staffLoginLink()

  return (
    <main>
      <Top title="Ajustes" sub={user.tenant_name} />
      <Flash ok={sp.ok as string} err={sp.err as string} />

      <div className="eyebrow">Link de reservas</div>
      <div className="card">
        <div className="row">
          <Icon name="link" style={{ color: 'var(--brass)' }} />
          <a className="grow link" href={link} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
            {link}
          </a>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Compártelo en Instagram, Google Maps y el estado de WhatsApp. Los clientes reservan sin descargar nada.
        </p>
      </div>

      <div className="eyebrow">Entrada de los barberos</div>
      <div className="card">
        <div className="row">
          <Icon name="sc" style={{ color: 'var(--brass)' }} />
          <a className="grow link" href={teamLink} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
            {teamLink}
          </a>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Mándaselo solo a tu equipo. Cada barbero entra con su celular y el PIN que le asignas. No lo compartas con clientes.
        </p>
      </div>

      <div className="eyebrow">WhatsApp</div>
      <Link href="/app/mensajes" className="card row">
        <span className="wa-dot">
          <Icon name="wa" />
        </span>
        <div className="grow">
          <b>Mensajes automáticos</b>
          <div className="small muted">Confirmaciones, recordatorios y avisos enviados</div>
        </div>
        <Icon name="back" style={{ transform: 'scaleX(-1)', color: 'var(--muted)' }} />
      </Link>

      <div className="eyebrow">Barberos</div>
      <div className="list card" style={{ padding: '2px 14px' }}>
        {barbers.map((b) => (
          <Link key={b.id} href={`/app/ajustes/barbero/${b.id}`} className="li" style={{ opacity: b.active ? 1 : 0.5 }}>
            <Avatar name={b.name} sm />
            <div className="grow">
              <div className="t">{b.name}</div>
              <div className="small muted">
                {fmtPhone(b.phone)} · {b.branch ?? 'sin sede'}
                {b.active ? '' : ' · inactivo'}
              </div>
            </div>
            <Icon name="back" style={{ transform: 'scaleX(-1)', color: 'var(--muted)' }} />
          </Link>
        ))}
      </div>
      <Link className="btn ghost sm" href="/app/ajustes/barbero/nuevo" style={{ marginTop: 10 }}>
        <Icon name="plus" /> Agregar barbero
      </Link>

      <div className="eyebrow">Servicios</div>
      <div className="stack">
        {services.map((s) => (
          <details key={s.id} className="more card">
            <summary className="row">
              <div className="grow" style={{ opacity: s.active ? 1 : 0.5 }}>
                <b>{s.name}</b>
                <div className="small muted">
                  {s.duration_min} min{s.active ? '' : ' · oculto'}
                </div>
              </div>
              <span className="price">{fmtMoney(s.price)}</span>
            </summary>
            <ServiceForm s={s} />
          </details>
        ))}
        <details className="more card">
          <summary className="row">
            <Icon name="plus" style={{ color: 'var(--brass)' }} />
            <b className="grow">Nuevo servicio</b>
          </summary>
          <ServiceForm />
        </details>
      </div>

      <div className="eyebrow">Sedes</div>
      <div className="stack">
        {branches.map((b) => (
          <details key={b.id} className="more card">
            <summary className="row">
              <Icon name="pin" style={{ color: 'var(--brass)' }} />
              <div className="grow">
                <b>{b.name}</b>
                <div className="small muted">{b.address}</div>
              </div>
            </summary>
            <BranchForm b={b} />
            {branches.length > 1 && (
              <details className="more" style={{ marginTop: 14 }}>
                <summary className="row small" style={{ color: 'var(--bad)', fontWeight: 700, minHeight: 44 }}>
                  Cerrar esta sede
                </summary>
                <form action={closeBranch} className="stack" style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={b.id} />
                  <p className="small muted" style={{ margin: 0 }}>
                    Deja de aparecer en las reservas y en la agenda. Lo que pasó en esta sede sigue en los reportes. Antes hay que pasar sus barberos a otra
                    sede y cancelar sus citas próximas.
                  </p>
                  <button className="btn no sm">Sí, cerrar {b.name}</button>
                </form>
              </details>
            )}
          </details>
        ))}
        {closed.map((b) => (
          <div key={b.id} className="card row">
            <Icon name="pin" style={{ color: 'var(--muted)' }} />
            <div className="grow">
              <b className="muted">{b.name}</b> <span className="pill dim">Cerrada</span>
              <div className="small muted">{b.address}</div>
            </div>
            <form action={reopenBranch}>
              <input type="hidden" name="id" value={b.id} />
              <button className="btn ghost sm inline">Reabrir</button>
            </form>
          </div>
        ))}
        <details className="more card">
          <summary className="row">
            <Icon name="plus" style={{ color: 'var(--brass)' }} />
            <b className="grow">Nueva sede</b>
          </summary>
          <BranchForm />
        </details>
      </div>

      <div className="eyebrow">Copias de seguridad</div>
      <div className="card stack">
        {shared ? (
          <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Cada día se guarda sola una copia de todo. Si quieres tener tus datos (citas, clientes, pagos) también en Drive o en una memoria USB,
            descárgalos aquí.
          </p>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Cada día se guarda sola una copia de todo (citas, clientes, pagos) en la carpeta <b>backups</b> del proyecto; quedan las últimas 14.
              Para tenerla también fuera del computador, descárgala y guárdala en Drive o en una memoria USB.
            </p>
            <div className="small">{lastBackup ? `Última copia: ${lastBackup}` : 'Todavía no hay copias.'}</div>
          </>
        )}
        <a className="btn ghost sm" href="/api/backup" download>
          {shared ? 'Descargar mis datos' : 'Descargar copia ahora'}
        </a>
      </div>

      <div className="eyebrow">Tu cuenta</div>
      <div className="stack">
        <Link className="btn ghost sm" href="/app/cuenta">
          Cambiar mi PIN
        </Link>
        <form action={logoutAction}>
          <button className="btn ghost sm">Salir</button>
        </form>
      </div>
    </main>
  )
}

function ServiceForm({ s }: { s?: { id: string; name: string; description: string | null; duration_min: number; price: number; active: boolean } }) {
  return (
    <form action={saveService} className="stack" style={{ marginTop: 12 }}>
      <input type="hidden" name="id" value={s?.id ?? ''} />
      <div className="field">
        <label>Nombre</label>
        <div className="in">
          <input name="name" defaultValue={s?.name} required />
        </div>
      </div>
      <div className="field">
        <label>Descripción corta</label>
        <div className="in">
          <input name="description" defaultValue={s?.description ?? ''} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Duración (min)</label>
          <div className="in">
            <input name="duration" type="number" min={5} step={5} defaultValue={s?.duration_min ?? 30} required />
          </div>
        </div>
        <div className="field">
          <label>Precio ($)</label>
          <div className="in">
            <input name="price" inputMode="numeric" data-money="" defaultValue={s?.price ? s.price.toLocaleString('es-CO').replace(/,/g, '.') : ''} required />
          </div>
        </div>
      </div>
      {s && (
        <label className="row small">
          <input type="checkbox" name="active" defaultChecked={s.active} /> Visible para reservar
        </label>
      )}
      <button className="btn sm">Guardar</button>
    </form>
  )
}

function BranchForm({ b }: { b?: { id: string; name: string; address: string | null } }) {
  return (
    <form action={saveBranch} className="stack" style={{ marginTop: 12 }}>
      <input type="hidden" name="id" value={b?.id ?? ''} />
      <div className="field">
        <label>Nombre</label>
        <div className="in">
          <input name="name" defaultValue={b?.name} required />
        </div>
      </div>
      <div className="field">
        <label>Dirección</label>
        <div className="in">
          <input name="address" defaultValue={b?.address ?? ''} />
        </div>
      </div>
      <button className="btn sm">Guardar</button>
    </form>
  )
}
