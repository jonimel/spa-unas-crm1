'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { ShopMark } from '@/components/ShopLogo'
import { fmtDuration, fmtMoney, fmtYmdShort } from '@/lib/time'
import { initials, normalizeCoPhone, PHONE_ERROR } from '@/lib/phone'
import { requestBooking } from './actions'

type Branch = { id: string; name: string; address: string | null }
type Service = { id: string; name: string; description: string | null; duration_min: number; price: number; is_addon: boolean }
type Barber = { id: string; name: string; branch_ids: string[] }
type SlotDto = { minutes: number; start: string; label: string; barberIds: string[] }
type Avail = { date: string; days: { ymd: string; free: number; open?: boolean }[]; slots: SlotDto[] }

const STORE = 'spa:me'
const short = (n: string) => n.split(' ')[0]

/** Grupo de un servicio en la lista (por el nombre; un catálogo propio sin estas palabras queda todo en "Servicios"). */
function categoryOf(name: string) {
  if (/pedi|pies/i.test(name)) return 'Pies'
  if (/acr[ií]lic|polygel|press|kapping|extensi|gel\b/i.test(name)) return 'Extensiones y refuerzo'
  if (/mani|manos|u[ñn]as/i.test(name)) return 'Manos'
  return 'Servicios'
}
const CATEGORY_ORDER = ['Manos', 'Pies', 'Extensiones y refuerzo', 'Servicios']
const catId = (c: string) => 'cat-' + c.toLowerCase().replace(/[^a-z]+/g, '-')

function Welcome({ branch }: { branch: { name: string; address: string | null } | null }) {
  return (
    <div className="welcome">
      <h2>
        Tus manos, <em>en buenas manos</em>
      </h2>
      <p>Elige tus servicios y la hora. Te confirmamos por WhatsApp.</p>
      {branch && (
        <div className="meta">
          <span>
            <Icon name="pin" /> {branch.name}
            {branch.address ? ` · ${branch.address}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

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
  const [serviceIds, setServiceIds] = useState<string[]>([])
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
  // servicios elegidos: primero los principales, después los adicionales (en el orden del catálogo)
  const chosen = services.filter((s) => serviceIds.includes(s.id))
  const mains = services.filter((s) => !s.is_addon)
  const addons = services.filter((s) => s.is_addon)
  const hasMain = chosen.some((s) => !s.is_addon)
  const totalMin = chosen.reduce((a, s) => a + s.duration_min, 0)
  const totalPrice = chosen.reduce((a, s) => a + s.price, 0)
  const chosenKey = chosen.map((s) => s.id).join(',')
  const groupedMains = [...mains].sort((a, b) => CATEGORY_ORDER.indexOf(categoryOf(a.name)) - CATEGORY_ORDER.indexOf(categoryOf(b.name)))
  const showCats = new Set(mains.map((s) => categoryOf(s.name))).size > 1
  const toggle = (id: string) => {
    setSlot(null)
    setServiceIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      // sin servicio principal no quedan adicionales sueltos
      return next.some((x) => mains.some((m) => m.id === x)) ? next : []
    })
  }
  const branchBarbers = useMemo(() => barbers.filter((b) => branchId && b.branch_ids.includes(branchId)), [barbers, branchId])
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name ?? ''

  // recordar a la clienta en este celular
  useEffect(() => {
    try {
      const me = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage solo existe en el navegador
      if (me?.phone) setPhone(me.phone)
    } catch {}
  }, [])

  // disponibilidad
  useEffect(() => {
    if (!branchId || !chosenKey || step < 3) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicador de carga al pedir disponibilidad
    setLoading(true)
    const q = new URLSearchParams({ branch: branchId, services: chosenKey })
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
  }, [slug, branchId, chosenKey, date, step, reload])

  // ¿ya es clienta?
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
        serviceIds: chosen.map((s) => s.id),
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
        <Welcome branch={null} />
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
              <h1>Servicios</h1>
              <div className="sub">Sede {branch?.name}</div>
            </div>
          </div>
        )}
        {stepsBar()}
        {single && <Welcome branch={branch} />}
        <div className="eyebrow">
          Paso {stepNo} de {steps} · ¿Qué te vas a hacer?
        </div>
        <p className="small muted" style={{ margin: '-4px 2px 10px' }}>
          Puedes elegir varios, por ejemplo manos y pies en la misma cita.
        </p>
        {showCats && (
          <nav className="chips cat-jump" aria-label="Ir a la categoría" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', padding: '8px 0', margin: '0 0 4px' }}>
            {CATEGORY_ORDER.filter((c) => mains.some((s) => categoryOf(s.name) === c)).map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                onClick={() => document.getElementById(catId(c))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {c === 'Extensiones y refuerzo' ? 'Extensiones' : c}
              </button>
            ))}
          </nav>
        )}
        <div className="stack" role="group" aria-label="Servicios">
          {groupedMains.map((s, i) => {
            const on = serviceIds.includes(s.id)
            const cat = categoryOf(s.name)
            const heading = showCats && (i === 0 || categoryOf(groupedMains[i - 1].name) !== cat)
            return (
              <div key={s.id} className="stack" style={{ gap: 0 }}>
              {heading && (
                <div className="svc-cat" id={catId(cat)} style={{ scrollMarginTop: 64, ...(i === 0 ? { marginTop: 4 } : {}) }}>
                  {cat}
                </div>
              )}
              <button className={'opt multi svc' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(s.id)}>
                <span className="grow">
                  <span className="t">{s.name}</span>
                  {s.description && <span className="d">{s.description}</span>}
                  <span className="svc-meta">
                    <span className="dur">
                      <Icon name="clock" /> {fmtDuration(s.duration_min)}
                    </span>
                  </span>
                </span>
                <span className="price">{fmtMoney(s.price)}</span>
              </button>
              </div>
            )
          })}
        </div>
        {hasMain && addons.length > 0 && (
          <>
            <div className="svc-cat">Adicionales (opcional)</div>
            <div className="stack" role="group" aria-label="Adicionales">
              {addons.map((s) => {
                const on = serviceIds.includes(s.id)
                return (
                  <button key={s.id} className={'opt multi addon svc' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(s.id)}>
                    <span className="grow">
                      <span className="t">{s.name}</span>
                      <span className="d">
                        +{fmtDuration(s.duration_min)}
                        {s.description ? ` · ${s.description}` : ''}
                      </span>
                    </span>
                    <span className="price">+{fmtMoney(s.price)}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
        <div className="cta">
          {hasMain && (
            <div className="total-bar" aria-live="polite">
              <span>
                {chosen.length === 1 ? '1 servicio' : `${chosen.length} servicios`} · {fmtDuration(totalMin)}
              </span>
              <b>{fmtMoney(totalPrice)}</b>
            </div>
          )}
          <button className="btn" disabled={!hasMain} onClick={() => setStep(3)}>
            Continuar
          </button>
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
              {chosen.map((s) => s.name).join(' + ')} · {fmtDuration(totalMin)}
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
                <em>{d.free ? f.mo : d.open === false ? 'cerrado' : 'lleno'}</em>
              </button>
            )
          })}
        </div>

        {branchBarbers.length > 1 && (
          <>
            <div className="eyebrow">¿Con quién?</div>
            <div className="bfilter" role="group" aria-label="Manicurista">
              <button className={'bchip' + (filter === 'any' ? ' on' : '')} onClick={() => { setFilter('any'); setSlot(null) }}>
                <span className="av any">
                  <Icon name="users" />
                </span>
                <span>
                  Cualquiera<small>La primera libre</small>
                </span>
              </button>
              {branchBarbers.map((b) => {
                const n = (avail?.slots ?? []).filter((s) => s.barberIds.includes(b.id)).length
                const none = !loading && n === 0
                return (
                  <button
                    key={b.id}
                    className={'bchip' + (filter === b.id ? ' on' : '') + (none ? ' none' : '')}
                    style={none && filter !== b.id ? { opacity: 0.55 } : undefined}
                    onClick={() => { setFilter(b.id); setSlot(null) }}
                  >
                    <span className="av">{initials(b.name)}</span>
                    <span>
                      {short(b.name)}
                      <small>{loading ? '…' : n === 0 ? 'Sin horas este día' : n === 1 ? '1 hora libre' : `${n} horas libres`}</small>
                    </span>
                  </button>
                )
              })}
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
          {!loading && !slots.length && <div className="empty">No hay horas libres este día. Prueba otro día{filter !== 'any' ? ' u otra manicurista' : ''}.</div>}
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
                        {ids.length === 1 ? short(barberName(ids[0])) : `${ids.length} manicuristas libres`}
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
          <div className="card row" style={{ borderColor: 'var(--ok-line)', background: 'var(--ok-soft)' }}>
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
          <label htmlFor="nota">Nota para la manicurista (opcional)</label>
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
        <dt>{chosen.length > 1 ? 'Servicios' : 'Servicio'}</dt>
        <dd>
          {chosen.map((s) => (
            <div key={s.id}>
              {s.is_addon ? '+ ' : ''}
              {s.name} · {fmtMoney(s.price)}
            </div>
          ))}
        </dd>
        <dt>Duración</dt>
        <dd>{fmtDuration(totalMin)}</dd>
        <dt>Manicurista</dt>
        <dd>{barberId ? barberName(barberId) : 'La primera libre'}</dd>
        <dt>Fecha</dt>
        <dd>
          {date && `${fmtYmdShort(date).wd} ${fmtYmdShort(date).day} ${fmtYmdShort(date).mo}`} · {slot?.label}
        </dd>
        <dt>Total</dt>
        <dd className="num" style={{ color: 'var(--brass)' }}>
          {fmtMoney(totalPrice)} · pagas en el spa
        </dd>
      </dl>
      {error && (
        <div className="flash err" role="alert">
          {error}
        </div>
      )}
      <p className="small muted" style={{ margin: '14px 2px 0' }}>
        Al solicitar aceptas el tratamiento de tus datos según la política de privacidad del spa.
      </p>
      <div className="cta">
        <button className="btn" disabled={pending || !when} onClick={submit}>
          {pending ? 'Enviando…' : 'Solicitar cita'}
        </button>
      </div>
    </main>
  )
}
