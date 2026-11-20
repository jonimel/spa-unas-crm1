import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PhoneInput } from '@/components/PhoneInput'
import { Icon } from '@/components/Icon'
import { Flash } from '@/components/ui'
import { currentUser, LOCK_MINUTES, login } from '@/lib/auth'
import { normalizeLoginPhone, PHONE_ERROR } from '@/lib/phone'
import { DEMO, demoLoginEnabled, showDemoLogins } from '@/lib/seed'
import { isStaffRole, STAFF_ROLES } from '../roles'

async function doLogin(fd: FormData) {
  'use server'
  const rol = String(fd.get('rol') ?? '')
  const back = `/entrar/${isStaffRole(rol) ? rol : 'barbero'}`
  const phone = String(fd.get('phone') ?? '')
  if (!normalizeLoginPhone(phone)) redirect(`${back}?err=phone`)
  const r = await login(phone, String(fd.get('pin') ?? ''), rol === 'dueno' ? 'owner' : 'barber')
  redirect(r === 'ok' ? '/app' : r === 'pick' ? '/entrar/elegir' : r === 'locked' ? `${back}?err=locked` : `${back}?err=1`)
}

export async function generateMetadata({ params }: PageProps<'/entrar/[rol]'>) {
  const { rol } = await params
  return { title: isStaffRole(rol) ? `Entrar · ${STAFF_ROLES[rol].title}` : 'Entrar' }
}

export default async function EntrarRol({ params, searchParams }: PageProps<'/entrar/[rol]'>) {
  const { rol } = await params
  if (!isStaffRole(rol)) notFound()
  if (await currentUser()) redirect('/app')
  const { err } = await searchParams
  const r = STAFF_ROLES[rol]
  const demo = showDemoLogins() && demoLoginEnabled()
  return (
    <main className="page">
      <div className="top">
        <Link className="back" href="/entrar" aria-label="Volver">
          <Icon name="back" />
        </Link>
      </div>
      <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0 10px' }}>
        <span className="role-badge">
          <Icon name={r.icon} />
        </span>
      </div>
      <h2 className="hero-title" style={{ fontSize: 34, textAlign: 'center' }}>
        {r.title}
      </h2>
      <p className="muted small" style={{ textAlign: 'center', margin: '-4px 0 6px' }}>
        Entra con tu celular y tu PIN
      </p>
      <form action={doLogin} className="stack" style={{ gap: 14, marginTop: 10 }}>
        <input type="hidden" name="rol" value={rol} />
        <div className="field">
          <label htmlFor="phone">Tu celular</label>
          <PhoneInput id="phone" name="phone" autoComplete="username" placeholder="300 000 0000" required shortCodes />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <div className="in">
            <input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="current-password" placeholder="4 dígitos" required />
          </div>
        </div>
        <Flash
          err={
            err === 'phone'
              ? PHONE_ERROR
              : err === 'locked'
                ? `Demasiados intentos con ese celular. Espera ${LOCK_MINUTES} minutos o pídele al dueño que revise tu PIN.`
                : err
                  ? 'Celular o PIN incorrecto'
                  : undefined
          }
        />
        <button className="btn" type="submit">
          Entrar como {r.short}
        </button>
        {rol === 'barbero' && <p className="small muted">¿Olvidaste tu PIN? Pídele al dueño de la barbería que te asigne uno nuevo.</p>}
        <p className="small muted">
          {rol === 'dueno' ? (
            <>
              ¿Eres barbero? <Link className="link" href="/entrar/barbero">Entra como barbero</Link>
            </>
          ) : (
            <>
              ¿Eres el dueño? <Link className="link" href="/entrar/dueno">Entra como dueño</Link>
            </>
          )}
        </p>
      </form>

      {demo && (
        <>
          <div className="eyebrow">Usuarios de prueba</div>
          <div className="card">
            <div className="kv">
              <span>{rol === 'dueno' ? DEMO.owner.name : 'Todos los barberos'}</span>
              <span className="num">
                {DEMO.login.phone} · PIN {DEMO.login.pin}
              </span>
            </div>
            {rol === 'barbero' && <p className="small muted" style={{ margin: '6px 0 0' }}>Después eliges con cuál barbero entrar.</p>}
          </div>
        </>
      )}
    </main>
  )
}
