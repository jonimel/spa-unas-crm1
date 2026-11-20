// Íconos de trazo (24×24, 1.7px). Uso: <Icon name="cal" />
// Los del spa: polish (esmalte, para el equipo / manicurista), nail, hand, sparkle, heart, drop, gift, leaf, alert.
const PATHS: Record<string, string> = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  pct: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sc: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6L20 18M8.6 16.4L20 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.9-1z"/><path d="M9 9.5c.3 2.3 2.2 4.3 4.6 4.8l1-1.1 1.6.8-.4 1.4c-3.4.4-7.1-3.2-6.8-6.7l1.4-.4.8 1.6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18h2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M9 21l2.5-6.5L14 17v4M8 11l3-3.5 3 1 2.5 3.5M11.5 14.5L10 9"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  polish: '<path d="M10 2.8h4a1 1 0 011 1V9h-6V3.8a1 1 0 011-1z"/><path d="M8.5 9h7v2.2"/><path d="M8.5 11.2c-2 .9-3 2.6-3 4.8v1.5A3.5 3.5 0 009 21h6a3.5 3.5 0 003.5-3.5V16c0-2.2-1-3.9-3-4.8z"/><path d="M8.8 15.2c.4-.9 1-1.4 1.8-1.7"/>',
  nail: '<path d="M7 21v-9.5C7 6.3 9.2 3 12 3s5 3.3 5 8.5V21"/><path d="M9.5 13c0-3.3 1-5.6 2.5-5.6s2.5 2.3 2.5 5.6v2.5h-5z"/>',
  hand: '<path d="M8 12V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10.5V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 013 0V13"/><path d="M17 9.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-1a6 6 0 01-4.6-2.2L4 15.6a1.6 1.6 0 012.4-2.1L8 15"/>',
  sparkle: '<path d="M11 3l1.7 5.3L18 10l-5.3 1.7L11 17l-1.7-5.3L4 10l5.3-1.7z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6C19.5 15.4 12 20 12 20z"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.8a6 6 0 01-12 0C6 9.9 12 3.5 12 3.5z"/><path d="M9.2 14.6a3 3 0 002.3 2.6"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1.2"/><path d="M5 12.5V20a1 1 0 001 1h12a1 1 0 001-1v-7.5M12 8.5V21"/><path d="M12 8.5C10.5 5 7 4.6 7 6.6c0 1.6 2.5 1.9 5 1.9zM12 8.5c1.5-3.5 5-3.9 5-1.9 0 1.6-2.5 1.9-5 1.9z"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 15-14-0.3 9.8-5.8 15-14 15z"/><path d="M5 19c2.5-4.5 5.5-7.5 9-9.5"/>',
  alert: '<path d="M10.3 4.2L2.8 17.5A2 2 0 004.5 20.5h15a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z"/><path d="M12 9.5v4.5M12 17.2v.01"/>',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size, style, className }: { name: string; size?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <svg
      className={'ic' + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={size ? { width: size, height: size, ...style } : style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  )
}
