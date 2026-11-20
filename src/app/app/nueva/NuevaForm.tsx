'use client'

import { useState } from 'react'
import { Icon } from '@/components/Icon'
import { PhoneInput } from '@/components/PhoneInput'
import { fmtDuration, fmtMoney } from '@/lib/time'

type Service = { id: string; name: string; duration_min: number; price: number; is_addon: boolean }
type Barber = { id: string; name: string; branch: string | null }

/** Formulario de "Nueva cita": la clienta arriba, día y hora solo si no es "ahora", y el total en el botón. */
export function NuevaForm(p: {
  action: (fd: FormData) => Promise<void>
  services: Service[]
  barbers: Barber[]
  isOwner: boolean
  today: string
  hh: string
}) {
  const mains = p.services.filter((s) => !s.is_addon)
  const addons = p.services.filter((s) => s.is_addon)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(mains[0] ? [mains[0].id] : []))
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const chosen = p.services.filter((s) => picked.has(s.id))
  const hasMain = chosen.some((s) => !s.is_addon)
  const totalMin = chosen.reduce((a, s) => a + s.duration_min, 0)
  const totalPrice = chosen.reduce((a, s) => a + s.price, 0)

  return (
    <form action={p.action} className="stack" style={{ gap: 14, marginTop: 8 }}>
      <div className="eyebrow" style={{ marginBottom: 0 }}>
        ¿Cuándo?
      </div>
      <div className="seg">
        <label>
          <input type="radio" name="when" value="now" checked={when === 'now'} onChange={() => setWhen('now')} />
          <span>
            <Icon name="walk" /> Ahora (de paso)
          </span>
        </label>
        <label>
          <input type="radio" name="when" value="later" checked={when === 'later'} onChange={() => setWhen('later')} />
          <span>
            <Icon name="cal" /> Otro día / hora
          </span>
        </label>
      </div>
      {when === 'later' && (
        <div className="grid2">
          <div className="field">
            <label htmlFor="date">Día</label>
            <div className="in">
              <input id="date" name="date" type="date" lang="es-CO" defaultValue={p.today} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="time">Hora</label>
            <div className="in">
              <input id="time" name="time" type="time" lang="es-CO" step={900} defaultValue={p.hh} required />
            </div>
          </div>
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: 0 }}>
        Clienta
      </div>
      <div className="field">
        <label htmlFor="phone">Celular (opcional)</label>
        <PhoneInput id="phone" name="phone" placeholder="Si ya es clienta, la reconocemos" />
      </div>
      <div className="field">
        <label htmlFor="name">Nombre</label>
        <div className="in">
          <input id="name" name="name" placeholder="Opcional si pusiste el celular" />
        </div>
      </div>

      {p.isOwner && (
        <div className="field">
          <label htmlFor="barber">Manicurista</label>
          <div className="in">
            <select id="barber" name="barber" required>
              {p.barbers.map((b) => (
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
        Servicios
      </div>
      <p className="small muted" style={{ margin: '-6px 2px 0' }}>
        Puedes marcar varios (por ejemplo manos y pies). La duración y el precio son la suma.
      </p>
      <div className="stack" role="group" aria-label="Servicios">
        {mains.map((s) => (
          <label key={s.id} className={'opt multi' + (picked.has(s.id) ? ' on' : '')}>
            <input type="checkbox" name="service" value={s.id} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
            <span className="grow">
              <div className="t">{s.name}</div>
              <div className="d">{fmtDuration(s.duration_min)}</div>
            </span>
            <span className="price">{fmtMoney(s.price)}</span>
          </label>
        ))}
      </div>
      {addons.length > 0 && (
        <>
          <div className="svc-cat">Adicionales</div>
          <div className="stack" role="group" aria-label="Adicionales">
            {addons.map((s) => (
              <label key={s.id} className={'opt multi addon' + (picked.has(s.id) ? ' on' : '')}>
                <input type="checkbox" name="service" value={s.id} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span className="grow">
                  <div className="t">{s.name}</div>
                  <div className="d">+{fmtDuration(s.duration_min)}</div>
                </span>
                <span className="price">+{fmtMoney(s.price)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="note">Nota (opcional)</label>
        <div className="in">
          <input id="note" name="note" />
        </div>
      </div>
      <div className="cta">
        {hasMain && (
          <div className="total-bar" aria-live="polite">
            <span>
              {chosen.length === 1 ? '1 servicio' : `${chosen.length} servicios`} · {fmtDuration(totalMin)}
            </span>
            <b>{fmtMoney(totalPrice)}</b>
          </div>
        )}
        <button className="btn" type="submit" disabled={!hasMain}>
          {!hasMain ? 'Elige un servicio' : when === 'now' ? `Registrar y cobrar · ${fmtMoney(totalPrice)}` : `Agendar · ${fmtDuration(totalMin)} · ${fmtMoney(totalPrice)}`}
        </button>
      </div>
    </form>
  )
}
