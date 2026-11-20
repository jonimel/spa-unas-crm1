'use client'

import { useEffect } from 'react'

/** 200000 → "200.000" (miles con punto, como se escribe en Colombia). */
export function groupThousands(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** En un valor por servicio, el monto se agrupa solo cuando es "$ fijo" (no en porcentajes como 55,5). */
function isMoney(el: HTMLInputElement) {
  const mode = el.dataset.money
  if (mode === '') return true
  if (mode === 'rate') {
    const kind = el.closest('.rate-row')?.querySelector('select')?.value
    if (kind === 'fixed') return true
    const model = el.form?.querySelector<HTMLInputElement>('input[name=model]:checked')?.value
    return kind === '' && model === 'fixed'
  }
  return false
}

/**
 * Agrega los puntos de miles mientras se escribe, en todo campo con `data-money`
 * (cobro, pagos a barberos, precios, arriendo, montos fijos). El servidor ignora los puntos.
 */
export function MoneyInputs() {
  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || el.dataset.money === undefined || !isMoney(el)) return
      const caret = el.selectionStart ?? el.value.length
      const digitsBefore = el.value.slice(0, caret).replace(/\D/g, '').replace(/^0+(?=\d)/, '').length
      const next = groupThousands(el.value)
      if (next === el.value) return
      el.value = next
      // deja el cursor después del mismo número de dígitos
      let pos = 0
      for (let seen = 0; pos < next.length && seen < digitsBefore; pos++) if (/\d/.test(next[pos])) seen++
      el.setSelectionRange(pos, pos)
    }
    document.addEventListener('input', onInput)
    return () => document.removeEventListener('input', onInput)
  }, [])
  return null
}
