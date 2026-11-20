// Logos. Spa Uñas Bella (el spa de ejemplo) tiene su sello: una uña almendrada en ciruela con un brillo.
// Los demás spas llevan sus iniciales con el mismo estilo (rosa nude + aro oro rosa), y el producto
// (inicio, Entrar) lleva el frasco de esmalte de Spa Uñas CRM.
// `ShopMark`: versión chica para encabezados; `ShopBadge`: el sello completo de Bella.
// Los colores son fijos (no dependen del tema) para que el logo se vea igual en claro y oscuro.

/** Slug del spa de ejemplo. (Se llama JP_SLUG por compatibilidad; DEMO_SLUG es lo mismo.) */
export const JP_SLUG = 'bella'
export const DEMO_SLUG = JP_SLUG
export const PRODUCT = 'Spa Uñas CRM'

const PLUM = '#7a2f55'
const PLUM_DEEP = '#4f1c37'
const BLUSH = '#f6e1dd'
const ROSE_GOLD = '#b57c69'
const DISPLAY = "var(--f-display), 'Cormorant Garamond', Georgia, serif"
const BODY = "var(--f-body), 'DM Sans', system-ui, sans-serif"

function monogram(name: string) {
  const words = name
    .replace(/^(spa|sal[oó]n|estudio|studio|u[ñn]as|nails?|de|la|el)\s+/gi, '')
    .replace(/^(spa|sal[oó]n|estudio|studio|u[ñn]as|nails?|de|la|el)\s+/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'S'
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}

function idFrom(s: string) {
  return s.normalize('NFD').replace(/[^A-Za-z0-9]/g, '') || 'x'
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ecc3b3" />
        <stop offset=".5" stopColor={ROSE_GOLD} />
        <stop offset="1" stopColor="#8f5a49" />
      </linearGradient>
      <linearGradient id={`${id}-plum`} x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stopColor="#9b4271" />
        <stop offset="1" stopColor={PLUM_DEEP} />
      </linearGradient>
    </defs>
  )
}

/** Uña almendrada con brillo, centrada en un lienzo de 64. */
function Nail({ id }: { id: string }) {
  return (
    <g>
      <path d="M32 12c7.2 0 11 8.6 11 19.5V47a5 5 0 01-5 5H26a5 5 0 01-5-5V31.5C21 20.6 24.8 12 32 12z" fill={`url(#${id}-plum)`} />
      <path d="M26 40.5V31c0-7 2.4-12.6 5.2-13.8" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M21 44.5h22" stroke={`url(#${id}-ring)`} strokeWidth="1.6" />
      <path d="M46.5 14l1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1z" fill={ROSE_GOLD} />
    </g>
  )
}

/** Frasco de esmalte (logo del producto). */
function Bottle({ id }: { id: string }) {
  return (
    <g>
      <rect x="27" y="11" width="10" height="16" rx="2.5" fill={PLUM_DEEP} />
      <rect x="24.5" y="26" width="15" height="4.5" rx="1.5" fill={`url(#${id}-ring)`} />
      <path d="M24 30.5h16c4.4 1.9 7 5.6 7 10.4v3.6a7.5 7.5 0 01-7.5 7.5h-15A7.5 7.5 0 0117 44.5v-3.6c0-4.8 2.6-8.5 7-10.4z" fill={`url(#${id}-plum)`} />
      <path d="M22.5 42c.6-2.6 2-4.4 4-5.4" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M46 13.5l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" fill={ROSE_GOLD} />
    </g>
  )
}

function Disc({ id }: { id: string }) {
  return (
    <>
      <circle cx="32" cy="32" r="30.5" fill={BLUSH} stroke={`url(#${id}-ring)`} strokeWidth="2" />
      <circle cx="32" cy="32" r="26.5" fill="none" stroke={ROSE_GOLD} strokeOpacity=".35" strokeWidth=".8" />
    </>
  )
}

/** Yema del dedo con la uña pintada (para el logo chico), recortada al círculo. */
function Fingertip({ id }: { id: string }) {
  return (
    <g clipPath={`url(#${id}-clip)`}>
      <path d="M16.5 66V33c0-9.6 6.9-16.5 15.5-16.5S47.5 23.4 47.5 33v33z" fill="#ebc6b6" />
      <path d="M16.5 66V33c0-9.6 6.9-16.5 15.5-16.5S47.5 23.4 47.5 33v33" fill="none" stroke="#c99583" strokeWidth="1" />
      <path d="M32 20.5c5.6 0 9 5.6 9 13.2V43a4.5 4.5 0 01-4.5 4.5h-9A4.5 4.5 0 0123 43v-9.3c0-7.6 3.4-13.2 9-13.2z" fill={`url(#${id}-plum)`} />
      <path d="M27 40v-6.5c0-4.6 1.5-8.3 3.6-9.6" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
    </g>
  )
}

/** Logo chico del spa: el de Bella, o las iniciales del nombre. Sin spa: el frasco del producto. */
export function ShopMark({ size = 40, slug, name }: { size?: number; slug?: string; name?: string }) {
  if (slug !== JP_SLUG) {
    if (!name) return <ProductMark size={size} />
    return <Monogram size={size} text={monogram(name)} label={name} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={name ?? 'Spa Uñas Bella'} style={{ flex: 'none', display: 'block' }}>
      <Defs id="bella-mk" />
      <defs>
        <clipPath id="bella-mk-clip">
          <circle cx="32" cy="32" r="29.5" />
        </clipPath>
      </defs>
      <Disc id="bella-mk" />
      <Fingertip id="bella-mk" />
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="url(#bella-mk-ring)" strokeWidth="2" />
      <path d="M48 13.5l1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1z" fill={ROSE_GOLD} />
    </svg>
  )
}

function ProductMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={PRODUCT} style={{ flex: 'none', display: 'block' }}>
      <Defs id="prod-mk" />
      <Disc id="prod-mk" />
      <g transform="translate(32 32) scale(.8) translate(-32 -32)">
        <Bottle id="prod-mk" />
      </g>
    </svg>
  )
}

function Monogram({ size, text, label }: { size: number; text: string; label: string }) {
  const id = `mg-${idFrom(text)}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} style={{ flex: 'none', display: 'block' }}>
      <Defs id={id} />
      <Disc id={id} />
      <text
        x="32"
        y={text.length > 1 ? 41 : 43}
        textAnchor="middle"
        style={{ fontFamily: DISPLAY, fontWeight: 600 }}
        fontSize={text.length > 1 ? 25 : 30}
        fill={PLUM}
        letterSpacing=".5"
      >
        {text}
      </text>
      <path d="M25 47.5h14" stroke={`url(#${id}-ring)`} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** Sello completo de Spa Uñas Bella. */
export function ShopBadge({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Spa Uñas Bella" style={{ display: 'block' }}>
      <Defs id="bella-bd" />
      <defs>
        <path id="bella-top" d="M 34 100 A 66 66 0 0 1 166 100" />
        <path id="bella-bottom" d="M 30 100 A 70 70 0 0 0 170 100" />
      </defs>
      <circle cx="100" cy="100" r="97" fill={BLUSH} stroke="url(#bella-bd-ring)" strokeWidth="3" />
      <circle cx="100" cy="100" r="86" fill="none" stroke={ROSE_GOLD} strokeOpacity=".45" strokeWidth="1" />
      <text style={{ fontFamily: BODY, fontWeight: 600 }} fontSize="11" letterSpacing="5" fill={PLUM}>
        <textPath href="#bella-top" startOffset="50%" textAnchor="middle">
          SPA DE UÑAS
        </textPath>
      </text>
      <text style={{ fontFamily: BODY, fontWeight: 600 }} fontSize="9" letterSpacing="3.5" fill={ROSE_GOLD}>
        <textPath href="#bella-bottom" startOffset="50%" textAnchor="middle">
          MANOS · PIES · CUIDADO
        </textPath>
      </text>
      <circle cx="24" cy="100" r="2.2" fill={ROSE_GOLD} />
      <circle cx="176" cy="100" r="2.2" fill={ROSE_GOLD} />
      <g transform="translate(100 74) scale(.62) translate(-32 -32)">
        <Nail id="bella-bd" />
      </g>
      <text x="100" y="134" textAnchor="middle" style={{ fontFamily: DISPLAY, fontWeight: 600, fontStyle: 'italic' }} fontSize="40" fill={PLUM}>
        Bella
      </text>
      <text x="100" y="152" textAnchor="middle" style={{ fontFamily: BODY, fontWeight: 600 }} fontSize="7.5" letterSpacing="2.5" fill={ROSE_GOLD}>
        SPA UÑAS
      </text>
    </svg>
  )
}
