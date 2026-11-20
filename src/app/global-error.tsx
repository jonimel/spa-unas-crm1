'use client'

/** Si falla hasta el diseño general de la app: página mínima en español (sin las fuentes ni los estilos). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CO">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#fbf6f1', color: '#2a1d24', padding: 24, textAlign: 'center' }}>
        <h2 style={{ marginTop: 60 }}>Algo salió mal</h2>
        <p>No pudimos cargar la app. Intenta de nuevo en un momento.</p>
        <button onClick={() => reset()} style={{ marginTop: 16, padding: '12px 20px', borderRadius: 99, border: 0, background: '#7a3e5a', color: '#fff', fontSize: 15 }}>
          Intentar de nuevo
        </button>
      </body>
    </html>
  )
}
