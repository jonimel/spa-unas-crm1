// Logos. JP Barbar (la barbería de ejemplo) tiene su sello; las demás barberías llevan sus iniciales
// con el mismo estilo dorado, y el producto (inicio, Entrar) lleva la "B" de Barbar.
// `ShopMark`: versión chica para encabezados; `ShopBadge`: el sello completo de JP Barbar.

export const JP_SLUG = 'jpbarbar'
export const PRODUCT = 'Barbar'

function monogram(name: string) {
  const words = name.replace(/^(barber[ií]a|barber[sí]?|peluquer[ií]a)\s+/i, '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'B'
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}

const GOLD = (
  <linearGradient id="jp-gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#efd9a4" />
    <stop offset=".45" stopColor="#c9a35c" />
    <stop offset="1" stopColor="#8c6a32" />
  </linearGradient>
)

/** Logo chico de la barbería: el de JP Barbar, o las iniciales del nombre. Sin barbería: la "B" del producto. */
export function ShopMark({ size = 40, slug, name }: { size?: number; slug?: string; name?: string }) {
  if (slug !== JP_SLUG) return <Monogram size={size} text={name ? monogram(name) : 'B'} label={name ?? PRODUCT} />
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="JP Barbar" style={{ flex: 'none', display: 'block' }}>
      <defs>{GOLD}</defs>
      <circle cx="32" cy="32" r="30.5" fill="#15120e" stroke="url(#jp-gold)" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#c9a35c" strokeOpacity=".45" strokeWidth="1" />
      <text x="32" y="40" textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="26" fill="url(#jp-gold)" letterSpacing="-.5">
        JP
      </text>
      <path d="M22 46.5h20" stroke="url(#jp-gold)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11.5" cy="32" r="1.3" fill="#c9a35c" />
      <circle cx="52.5" cy="32" r="1.3" fill="#c9a35c" />
    </svg>
  )
}

function Monogram({ size, text, label }: { size: number; text: string; label: string }) {
  const id = `mg-${text.normalize("NFD").replace(/[^A-Za-z]/g, "")}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efd9a4" />
          <stop offset=".45" stopColor="#c9a35c" />
          <stop offset="1" stopColor="#8c6a32" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30.5" fill="#15120e" stroke={`url(#${id})`} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#c9a35c" strokeOpacity=".45" strokeWidth="1" />
      <text x="32" y={text.length > 1 ? 40 : 42} textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="800" fontSize={text.length > 1 ? 24 : 30} fill={`url(#${id})`} letterSpacing="-.5">
        {text}
      </text>
      <path d="M22 47h20" stroke={`url(#${id})`} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Navaja recta (hoja + mango), dibujada horizontal y centrada en 0,0. */
function Razor() {
  return (
    <g>
      <path d="M-46 -5 h44 a5 5 0 0 1 5 5 v0 a5 5 0 0 1 -5 5 h-40 l-4 -4 z" fill="#c9a35c" fillOpacity=".9" />
      <path d="M-42 -1.5 h36" stroke="#15120e" strokeOpacity=".35" strokeWidth="1" />
      <circle cx="0" cy="0" r="2.2" fill="#15120e" />
      <path d="M2 -3.5 h42 a3.5 3.5 0 0 1 0 7 h-42 z" fill="#5c4422" />
    </g>
  )
}

export function ShopBadge({ size = 132 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="JP Barbar · Villa Hermosa" style={{ display: 'block' }}>
      <defs>
        {GOLD}
        <path id="jp-top" d="M 34 100 A 66 66 0 0 1 166 100" />
        <path id="jp-bottom" d="M 28 100 A 72 72 0 0 0 172 100" />
      </defs>
      <circle cx="100" cy="100" r="97" fill="#15120e" stroke="url(#jp-gold)" strokeWidth="3" />
      <circle cx="100" cy="100" r="87" fill="none" stroke="#c9a35c" strokeOpacity=".55" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="53" fill="none" stroke="#c9a35c" strokeOpacity=".35" strokeWidth="1" />
      <text fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="700" fontSize="17" letterSpacing="5" fill="url(#jp-gold)">
        <textPath href="#jp-top" startOffset="50%" textAnchor="middle">
          BARBERÍA
        </textPath>
      </text>
      <text fontFamily="'Manrope', sans-serif" fontWeight="700" fontSize="10.5" letterSpacing="3.2" fill="#c9a35c">
        <textPath href="#jp-bottom" startOffset="50%" textAnchor="middle">
          VILLA HERMOSA · MEDELLÍN
        </textPath>
      </text>
      <circle cx="22" cy="100" r="2.4" fill="#c9a35c" />
      <circle cx="178" cy="100" r="2.4" fill="#c9a35c" />
      <g opacity=".22">
        <g transform="translate(100 100) rotate(35)">
          <Razor />
        </g>
        <g transform="translate(100 100) rotate(-35) scale(-1 1)">
          <Razor />
        </g>
      </g>
      <text x="100" y="114" textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="58" letterSpacing="-1" fill="url(#jp-gold)">
        JP
      </text>
      <text x="100" y="134" textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="700" fontSize="15" letterSpacing="4.5" fill="#efe6d6">
        BARBAR
      </text>
      <text x="100" y="148" textAnchor="middle" fontFamily="'Manrope', sans-serif" fontWeight="600" fontSize="7.5" letterSpacing="2.5" fill="#c9a35c" fillOpacity=".8">
        EST. 2019
      </text>
    </svg>
  )
}
