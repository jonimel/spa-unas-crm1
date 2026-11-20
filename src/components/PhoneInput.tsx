'use client'

import { useEffect, useRef, useState } from 'react'
import { isShortCode, normalizeCoPhone, PHONE_ERROR } from '@/lib/phone'

/**
 * Campo de celular que avisa en el momento si el número no sirve (borde rojo + mensaje debajo)
 * y no deja enviar el formulario hasta corregirlo.
 * `shortCodes`: acepta también un código de 4 dígitos (usuarios de prueba: 3000, 4000…).
 * `keep`: el valor guardado se acepta tal cual aunque no sea un celular (para no bloquear al editar).
 */
export function PhoneInput({
  id,
  name,
  required,
  defaultValue = '',
  placeholder,
  autoComplete,
  shortCodes,
  keep,
}: {
  id: string
  name: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  autoComplete?: string
  shortCodes?: boolean
  keep?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [touched, setTouched] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const digits = value.replace(/\D/g, '')
  const mobile = normalizeCoPhone(value) !== null
  const ok = mobile || (!!shortCodes && isShortCode(digits)) || (!!keep && digits === keep.replace(/\D/g, ''))
  const bad = value.trim().length > 0 && !ok
  const show = bad && (touched || digits.length >= 10)

  useEffect(() => {
    ref.current?.setCustomValidity(bad ? PHONE_ERROR : '')
  }, [bad])

  return (
    <>
      <div className={'in' + (show ? ' err' : mobile ? ' ok' : '')}>
        <span className="cc">+57</span>
        <input
          ref={ref}
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          value={value}
          aria-invalid={show || undefined}
          aria-describedby={show ? `${id}-err` : undefined}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onInvalid={() => setTouched(true)}
        />
      </div>
      {show && (
        <div id={`${id}-err`} className="hint err" role="alert">
          {PHONE_ERROR}
        </div>
      )}
    </>
  )
}
