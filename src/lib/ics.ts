import type { ApptView } from './booking'

/** Archivo .ics (iCalendar) para que la clienta guarde su cita en el calendario del celular. */

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Escapa texto según RFC 5545 (barra, punto y coma, coma y saltos de línea). */
export function icsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Corta las líneas largas a 75 octetos, como pide el estándar (las siguientes empiezan con un espacio). */
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch)
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

type IcsAppt = Pick<ApptView, 'id' | 'tenant_name' | 'service_name' | 'starts_at' | 'ends_at' | 'branch_name' | 'branch_address' | 'barber_name'>

export function appointmentIcs(a: IcsAppt, link: string, now = new Date()) {
  const location = [a.tenant_name, a.branch_name, a.branch_address].filter(Boolean).join(', ')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Spa Unas CRM//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}@spa-unas-crm`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(new Date(a.starts_at))}`,
    `DTEND:${stamp(new Date(a.ends_at))}`,
    `SUMMARY:${icsText(`${a.tenant_name}: ${a.service_name}`)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(`Con ${a.barber_name}. Tu cita: ${link}`)}`,
    `URL:${link}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT2H',
    `DESCRIPTION:${icsText(`Cita en ${a.tenant_name}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
