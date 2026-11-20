'use client'

// Chrome en el iPhone (y algunas extensiones) le agrega a la página atributos propios para autocompletar,
// como __gcruniqueid en los campos o __gcrremoteframetoken en <html>. En modo desarrollo React lo ve como
// "el HTML no coincide con el servidor" y Next.js lo muestra en rojo ("1 Issue"), aunque la app funciona bien.
// Aquí se ignora solo ese aviso, solo cuando todas las diferencias son atributos del navegador, y solo en desarrollo.

const BROWSER_ATTR = /__gcr|data-gr-|data-new-gr-|cz-shortcut-listen|data-lt-installed/

function isBrowserNoise(args: unknown[]) {
  if (typeof args[0] !== 'string' || !args[0].includes("didn't match the client properties")) return false
  // args[0] es el texto de React (trae su propia lista con guiones); las diferencias vienen después
  const diff = args.slice(1).map((a) => (typeof a === 'string' ? a : '')).join('\n')
  const changed = diff.split('\n').filter((l) => /^\s*[+-]\s/.test(l))
  return changed.length > 0 && changed.every((l) => BROWSER_ATTR.test(l))
}

if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  const original = console.error
  console.error = (...args: unknown[]) => {
    if (isBrowserNoise(args)) return
    original.apply(console, args)
  }
}

export function BrowserNoise() {
  return null
}
