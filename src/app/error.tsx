'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Icon } from '@/components/Icon'

/** Error inesperado en una página: mensaje en español y la opción de intentar de nuevo. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="page">
      <div className="confirm">
        <div className="confirm-mark bad">
          <Icon name="alert" />
        </div>
        <h2>Algo salió mal</h2>
        <p>No pudimos cargar esta página. Intenta de nuevo; si sigue pasando, escríbenos.</p>
        {error.digest && <p className="small muted">Código: {error.digest}</p>}
      </div>
      <div className="stack" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => reset()}>
          Intentar de nuevo
        </button>
        <Link className="btn ghost" href="/">
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
