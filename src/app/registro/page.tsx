import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PhoneInput } from '@/components/PhoneInput'
import { ShopMark } from '@/components/ShopLogo'
import { Flash } from '@/components/ui'
import { currentUser, startSession } from '@/lib/auth'
import { BookingError } from '@/lib/booking'
import { createShop } from '@/lib/signup'

export const metadata = { title: 'Registra tu spa · Spa Uñas CRM' }

const KEEP = ['shop', 'city', 'branch', 'address', 'owner', 'phone'] as const

async function register(fd: FormData) {
  'use server'
  const v = (k: string) => String(fd.get(k) ?? '')
  let ownerId: string
  try {
    ;({ ownerId } = await createShop({ shop: v('shop'), city: v('city'), branch: v('branch'), address: v('address'), owner: v('owner'), phone: v('phone'), pin: v('pin'), pin2: v('pin2') }))
  } catch (e) {
    if (e instanceof BookingError) {
      // se devuelve lo escrito (menos el PIN) para no tener que llenar todo otra vez
      const q = new URLSearchParams({ err: e.message })
      for (const k of KEEP) if (v(k)) q.set(k, v(k).slice(0, 120))
      redirect(`/registro?${q}`)
    }
    throw e
  }
  await startSession(ownerId)
  redirect(`/app/ajustes?ok=${encodeURIComponent('¡Listo! Tu spa está creado. Ahora agrega a tus manicuristas con su horario y revisa los servicios y precios.')}`)
}

export default async function Registro({ searchParams }: PageProps<'/registro'>) {
  if (await currentUser()) redirect('/app')
  const sp = await searchParams
  const err = typeof sp.err === 'string' ? sp.err : undefined
  const val = (k: (typeof KEEP)[number]) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  return (
    <main className="page">
      <div className="top">
        <div className="tt brand">
          <ShopMark size={38} />
          <div>
            <b>Spa Uñas</b>
            <span>Agenda para spas de uñas</span>
          </div>
        </div>
      </div>
      <h2 className="hero-title" style={{ fontSize: 38 }}>
        Registra tu <em>spa</em>
      </h2>
      <p className="muted small" style={{ lineHeight: 1.5 }}>
        En un minuto tienes tu link de reservas, la agenda de cada manicurista y los cobros. Sin descargar nada.
      </p>
      <form action={register} className="stack" style={{ gap: 14, marginTop: 6 }}>
        <div className="eyebrow">El spa</div>
        <div className="field">
          <label htmlFor="shop">Nombre del spa</label>
          <div className="in">
            <input id="shop" name="shop" defaultValue={val('shop')} placeholder="Ej.: Spa Uñas Divinas" minLength={2} maxLength={60} required autoComplete="organization" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="city">Ciudad</label>
          <div className="in">
            <input id="city" name="city" defaultValue={val('city')} placeholder="Ej.: Medellín" maxLength={60} autoComplete="address-level2" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="branch">Sede</label>
          <div className="in">
            <input id="branch" name="branch" defaultValue={val('branch')} placeholder="Ej.: Laureles (más sedes, después en Ajustes)" maxLength={60} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="address">Dirección (opcional)</label>
          <div className="in">
            <input id="address" name="address" defaultValue={val('address')} placeholder="Ej.: Cra. 70 #44-10" maxLength={120} autoComplete="street-address" />
          </div>
        </div>
        <div className="eyebrow">Tus datos</div>
        <div className="field">
          <label htmlFor="owner">Tu nombre</label>
          <div className="in">
            <input id="owner" name="owner" defaultValue={val('owner')} minLength={2} maxLength={60} required autoComplete="name" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="phone">Tu celular (con este entras)</label>
          <PhoneInput id="phone" name="phone" defaultValue={val('phone')} autoComplete="tel-national" placeholder="300 000 0000" required />
        </div>
        <div className="field">
          <label htmlFor="pin">Crea un PIN (4 a 6 números)</label>
          <div className="in">
            <input id="pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="new-password" required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="pin2">Repite el PIN</label>
          <div className="in">
            <input id="pin2" name="pin2" type="password" inputMode="numeric" pattern="[0-9]{4,6}" autoComplete="new-password" required />
          </div>
        </div>
        <Flash err={err} />
        <button className="btn" type="submit">
          Crear mi spa
        </button>
        <p className="small muted">
          ¿Ya tienes cuenta? <Link href="/entrar/dueno">Entrar como dueña o administradora</Link>
        </p>
      </form>
    </main>
  )
}
