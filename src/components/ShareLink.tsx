'use client'

import { useState } from 'react'
import { Icon } from '@/components/Icon'

/** "Copiar link" y "Compartir por WhatsApp" debajo del link de reservas. */
export function ShareLink({ link, shopName }: { link: string; shopName: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // sin permiso de portapapeles (http, navegador viejo): se selecciona a mano
      window.prompt('Copia el link:', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Reserva tu cita en ${shopName}: ${link}`)}`
  return (
    <div className="row share-row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      <button type="button" className="btn ghost sm" style={{ flex: 1 }} onClick={copy} aria-live="polite">
        <Icon name={copied ? 'check' : 'link'} /> {copied ? '¡Copiado!' : 'Copiar link'}
      </button>
      <a className="btn wa sm" style={{ flex: 1 }} href={wa} target="_blank" rel="noreferrer">
        <Icon name="wa" /> Compartir por WhatsApp
      </a>
    </div>
  )
}
