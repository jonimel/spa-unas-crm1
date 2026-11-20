'use client'

import { useEffect } from 'react'

/**
 * Un doble toque en un botón (Registrar pago, Confirmar, Guardar…) enviaba el formulario dos veces.
 * Mientras un formulario se está enviando, los toques siguientes se ignoran y el botón se ve apagado.
 * Se libera solo a los pocos segundos por si el envío vuelve a la misma página con un aviso.
 */
export function NoDoubleSubmit() {
  useEffect(() => {
    const busy = new WeakMap<HTMLFormElement, number>()
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target
      if (!(form instanceof HTMLFormElement) || form.method === 'get') return
      if (busy.has(form)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      const btn = e.submitter instanceof HTMLButtonElement ? e.submitter : null
      // después de que React lea el formulario (un botón apagado no se envía)
      setTimeout(() => {
        btn?.setAttribute('aria-busy', 'true')
        btn?.style.setProperty('opacity', '.6')
      })
      busy.set(
        form,
        window.setTimeout(() => {
          busy.delete(form)
          btn?.removeAttribute('aria-busy')
          btn?.style.removeProperty('opacity')
        }, 4000),
      )
    }
    window.addEventListener('submit', onSubmit, true)
    return () => window.removeEventListener('submit', onSubmit, true)
  }, [])
  return null
}
