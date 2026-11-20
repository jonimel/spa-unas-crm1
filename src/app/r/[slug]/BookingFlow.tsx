'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { ShopMark } from '@/components/ShopLogo'
import { fmtDuration, fmtMoney, fmtYmdShort } from '@/lib/time'
import { initials, normalizeCoPhone, PHONE_ERROR } from '@/lib/phone'
import { requestBooking } from './actions'

type Branch = { id: string; name: string; address: string | null }
type Service = { id: string; name: string; description: string | null; duration_min: number; price: number }
type Barber = { id: string; name: string; branch_ids: string[] }
type SlotDto = { minutes: number; start: string; label: string; barberIds: string[] }
type Avail = { date: string; days: { ymd: string; free: number }[]; slots: SlotDto[] }

const STORE = 'barbar:me'
const short = (n: string) => n.split(' ')[0]

export function BookingFlow(props: {
  slug: string
  tenant: { name: string; city: string | null }
  branches: Branch[]
  services: Service[]
  barbers: Barber[]
}) {
  const { slug, tenant, branches, services, barbers } = props
  const router = useRouter()
  const single = branches.length === 1
  const [step, setStep] = useState(single ? 2 : 1)
  const [branchId, setBranchId] = useState<string | null>(single ? branches[0].id : null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('any')
  const [avail, setAvail] = useState<Avail | null>(null)
  const [loading, setLoading] = useState(false)
  const [slot, setSlot] = useState<SlotDto | null>(null)
  const [barberId, setBarberId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const phoneRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [known, setKnown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [reload, setReload] = useState(0)

  const branch = branches.find((b) => b.id === branchId) ?? null
  const service = services.find((s) => s.id === serviceId) ?? null
  const branchBarbers = useMemo(() => barbers.filter((b) => branchId && b.branch_ids.includes(branchId)), [barbers, branchId])
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name ?? ''

  // recordar al cliente en este celular
  useEffect(() => {
    try {
      const me = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage solo existe en el navegador
      if (me?.phone) setPhone(me.phone)
    } catch {}
  }, [])

  // disponibilidad
  useEffect(() => {
    if (!branchId || !serviceId || step < 3) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicador de carga al pedir disponibilidad
    setLoading(true)
    const q = new URLSearchParams({ branch: branchId, service: serviceId })
    if (date) q.set('date', date)
    fetch(`/api/r/${slug}/availability?${q}`)
      .then((r) => r.json())
      .then((d: Avail) => {
        if (!alive) return
        setAvail(d)
        if (!date) setDate(d.date)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [slug, branchId, serviceId, date, step, reload])

  // ¿ya es cliente?
  const normPhone = normalizeCoPhone(phone)
  const phoneBad = !normPhone && (phoneTouched || phone.replace(/\D/g, '').length >= 10)
  useEffect(() => {
    if (!normPhone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpiar al borrar el número
      setKnown(null)
      return
    }
    let alive = true
    fetch(`/api/r/${slug}/client?phone=${normPhone}`)
      .then((r) => r.json())
      .then((d) => alive && setKnown(d.known ? d.name : null))
    return () => {
      alive = false
    }
  }, [slug, normPhone])

  const slots = (avail?.slots ?? []).filter((s) => filter === 'any' || s.barberIds.includes(filter))
  const groups = [
    { label: 'Mañana', items: slots.filter((s) => s.minutes < 12 * 60) },
    { label: 'Tarde', items: slots.filter((s) => s.minutes >= 12 * 60 && s.minutes < 18 * 60) },
    { label: 'Noche', items: slots.filter((s) => s.minutes >= 18 * 60) },
  ].filter((g) => g.items.length)

  function chooseSlot(s: SlotDto) {
    setSlot(s)
    setBarberId(filter !== 'any' ? filter : s.barberIds.length === 1 ? s.barberIds[0] : null)
  }

  function submit() {
    setError(null)
    if (!normPhone) {
      setPhoneTouched(true)
      phoneRef.current?.focus()
      return
    }
    if (!known && !name.trim()) {
      setError('Escribe tu nombre')
      return
    }
    start(async () => {
      const r = await requestBooking({
        slug,
        branchId: branchId!,
        serviceId: serviceId!,
        start: slot!.start,
        barberId,
        phone,
        name: known ? '' : name,
        note,
      })
      if (r.ok) {
        try {
          localStorage.setItem(STORE, JSON.stringify({ phone: normPhone }))
        } catch {}
        router.push(`/r/${slug}/cita/${r.id}`)
      } else {
        setError(r.error)
        if (r.error.includes('ya no está disponible')) {
          setSlot(null)
          setStep(3)
          setReload((n) => n + 1)
        }
      }
    })
  }

  const steps = single ? 3 : 4
  const stepNo = single ? step - 1 : step
  const stepsBar = () => (
    <div className="steps" aria-hidden="true">
      {Array.from({ length: steps }, (_, i) => (
        <i key={i} className={i < stepNo ? 'on' : ''} />
      ))}
    </div>
  )
  const backBtn = (to: number) => (
    <button className="back" aria-label="Volver" onClick={() => setStep(to)}>
      <Icon name="back" />
    </button>
  )

  if (step === 1)
    return (
      <main className="page">
        <div className="top">
          <div className="tt brand">
            <ShopMark size={38} slug={slug} name={tenant.name} />
            <div>
              <b>{tenant.name}</b>
              <span>Reserva tu cita</span>
            </div>
          </div>
        </div>
        {stepsBar()}
        <div className="eyebrow">Paso 1 de {steps} · Elige la sede</div>
        <div className="stack" role="group" aria-label="Sede">
          {branches.map((b) => (
            <button
              key={b.id}
              className={'opt' + (b.id === branchId ? ' on' : '')}
              onClick={() => {
                if (b.id !== branchId) {
                  setFilter('any')
                  setSlot(null)
                }
                setBranchId(b.id)
                setStep(2)
              }}
            >
              <span className="av">
                <Icon name="pin" />
              </span>
              <span className="grow">
                <div className="t">{b.name}</div>
                {b.address && <div className="d">{b.address}</div>}
              </span>
            </button>
          ))}
        </div>
      </main>
    )

  if (step === 2)
    return (
      <main className="page">
        {single ? (
          <div className="top">
            <div className="tt brand">
              <ShopMark size={38} slug={slug} name={tenant.name} />
              <div>
                <b>{tenant.name}</b>
                <span>Reserva tu cita · {branch?.name}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="top">
            {backBtn(1)}
            <div className="tt">
              <h1>Servicio</h1>
              <div className="sub">Sede {branch?.name}</div>
            </div>
          </div>
        )}
        {stepsBar()}
        <div className="eyebrow">
          Paso {stepNo} de {steps} · ¿Qué te vas a hacer?
        </div>
        <div className="stack" role="group" aria-label="Servicio">
          {services.map((s) => (
            <button
              key={s.id}
              className={'opt' + (s.id === serviceId ? ' on' : '')}
              onClick={() => {
                if (s.id !== serviceId) setSlot(null)
                setServiceId(s.id)
                setStep(3)
              }}
            >
              <span className="grow">
                <div className="t">{s.name}</div>
                <div className="d">
                  {fmtDuration(s.duration_min)}
                  {s.description ? ` · ${s.description}` : ''}
                </div>
              </span>
              <span className="price">{fmtMoney(s.price)}</span>
            </button>
          ))}
        </div>
      </main>
    )

  if (step === 3)
    return (
      <main className="page">
        <div className="top">
          {backBtn(2)}
          <div className="tt">
            <h1>Día y hora</h1>
            <div className="sub">
              {service?.name} · {service && fmtDuration(service.duration_min)}
              {!single && ` · ${branch?.name}`}
            </div>
          </div>
        </div>
        {stepsBar()}
        <div className="eyebrow">
          Paso {stepNo} de {steps} · Elige el día
        </div>
        <div className="days" role="group" aria-label="Día">
          {(avail?.days ?? []).map((d) => {
            const f = fmtYmdShort(d.ymd)
            return (
              <button
                key={d.ymd}
                className={'day' + (d.ymd === date ? ' on' : '') + (d.free ? '' : ' off')}
                disabled={!d.free}
                aria-pressed={d.ymd === date}
                onClick={() => {
                  setDate(d.ymd)
                  setSlot(null)
                }}
              >
                <small>{f.wd}</small>
                <b>{f.day}</b>
                <em>{d.free ? f.mo : 'lleno'}</em>
              </button>
            )
          })}
        </div>

        {branchBarbers.length > 1 && (
          <>
            <div className="eyebrow">¿Con quién?</div>
            <div className="bfilter" role="group" aria-label="Barbero">
              <button className={'bchip' + (filter === 'any' ? ' on' : '')} onClick={() => { setFilter('any'); setSlot(null) }}>
                <span className="av any">
                  <Icon name="users" />
                </span>
                <span>
                  Cualquiera<small>El primero libre</small>
                </span>
              </button>
              {branchBarbers.map((b) => (
                <button key={b.id} className={'bchip' + (filter === b.id ? ' on' : '')} onClick={() => { setFilter(b.id); setSlot(null) }}>
                  <span className="av">{initials(b.name)}</span>
                  <span>
                    {short(b.name)}
                    <small>{(avail?.slots ?? []).filter((s) => s.barberIds.includes(b.id)).length} libres</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="row" style={{ margin: '22px 0 4px' }}>
          <div className="eyebrow grow" style={{ margin: 0 }}>
            Horas libres
          </div>
          <span className="small muted">{loading ? 'Cargando…' : `${slots.length} disponibles`}</span>
        </div>
        <div className="tslots" aria-live="polite">
          {!loading && !slots.length && <div className="empty">No hay horas libres este día. Prueba otro día{filter !== 'any' ? ' u otro barbero' : ''}.</div>}
          {groups.map((g) => (
            <div key={g.label} className="stack" style={{ gap: 8 }}>
              <div className="tgroup">{g.label}</div>
              {g.items.map((s) => {
                const on = slot?.start === s.start
                const ids = filter === 'any' ? s.barberIds : [filter]
                return (
                  <div key={s.start} className="stack" style={{ gap: 8 }}>
                    <button className={'tslot' + (on ? ' on' : '')} aria-pressed={on} onClick={() => chooseSlot(s)}>
                      <span className="tm">{s.label}</span>
                      <span className="who">
                        {ids.length === 1 ? short(barberName(ids[0])) : `${ids.length} barberos libres`}
                      </span>
                      <span className="avs">
                        {ids.slice(0, 3).map((id) => (
                          <span key={id} className="av">
                            {initials(barberName(id))}
                          </span>
                        ))}
                      </span>
                    </button>
                    {on && ids.length > 1 && (
                      <div className="pickb">
                        <p>¿Tienes preferencia?</p>
                        <div className="chips">
                          <button className={'chip' + (barberId === null ? ' on' : '')} onClick={() => setBarberId(null)}>
                            Me da igual
                          </button>
                          {ids.map((id) => (
                            <button key={id} className={'chip' + (barberId === id ? ' on' : '')} onClick={() => setBarberId(id)}>
                              {short(barberName(id))}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="cta">
          <button className="btn" disabled={!slot} onClick={() => setStep(4)}>
            Continuar
          </button>
        </div>
      </main>
    )

  // paso 4
  const when = slot ? new Date(slot.start) : null
  return (
    <main className="page">
      <div className="top">
        {backBtn(3)}
        <div className="tt">
          <h1>Tus datos</h1>
          <div className="sub">Sin registro, sin contraseña</div>
        </div>
      </div>
      {stepsBar()}
      <div className="eyebrow">
        Paso {stepNo} de {steps} · ¿A qué WhatsApp te confirmamos?
      </div>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="tel">Celular (WhatsApp)</label>
          <div className={'in' + (normPhone ? ' ok' : phoneBad ? ' err' : '')}>
            <span className="cc">+57</span>
            <input
              ref={phoneRef}
              id="tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="310 000 0000"
              value={phone}
              aria-invalid={phoneBad || undefined}
              aria-describedby={phoneBad ? 'tel-err' : undefined}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => phone.trim() && setPhoneTouched(true)}
            />
            {normPhone && <Icon name="check" style={{ color: 'var(--ok)' }} />}
          </div>
          {phoneBad && (
            <div id="tel-err" className="hint err" role="alert">
              {PHONE_ERROR}
            </div>
          )}
        </div>
        {known ? (
          <div className="card row" style={{ borderColor: 'rgba(115,176,131,.4)', background: 'var(--ok-soft)' }}>
            <Icon name="check" style={{ color: 'var(--ok)' }} />
            <div className="grow">
              <b>¡Hola de nuevo, {known}!</b>
              <div className="small muted">Ya tenemos tus datos.</div>
            </div>
            <button className="link small" onClick={() => { setPhone(''); setKnown(null) }}>
              ¿No eres tú?
            </button>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="nom">Nombre</label>
            <div className="in">
              <input id="nom" autoComplete="name" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="nota">Nota para el barbero (opcional)</label>
          <div className="in">
            <input id="nota" placeholder="Ej.: igual que la última vez" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="eyebrow">Resumen</div>
      <dl className="card sum">
        {!single && (
          <>
            <dt>Sede</dt>
            <dd>{branch?.name}</dd>
          </>
        )}
        <dt>Servicio</dt>
        <dd>{service?.name}</dd>
        <dt>Barbero</dt>
        <dd>{barberId ? barberName(barberId) : 'El primero libre'}</dd>
        <dt>Fecha</dt>
        <dd>
          {date && `${fmtYmdShort(date).wd} ${fmtYmdShort(date).day} ${fmtYmdShort(date).mo}`} · {slot?.label}
        </dd>
        <dt>Total</dt>
        <dd className="num" style={{ color: 'var(--brass)' }}>
          {service && fmtMoney(service.price)} · pagas en la barbería
        </dd>
      </dl>
      {error && (
        <div className="flash err" role="alert">
          {error}
        </div>
      )}
      <p className="small muted" style={{ margin: '14px 2px 0' }}>
        Al solicitar aceptas el tratamiento de tus datos según la política de privacidad de la barbería.
      </p>
      <div className="cta">
        <button className="btn" disabled={pending || !when} onClick={submit}>
          {pending ? 'Enviando…' : 'Solicitar cita'}
        </button>
      </div>
    </main>
  )
}
