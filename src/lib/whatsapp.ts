import { one, type Queryable } from './db'

/**
 * Mensajes de WhatsApp.
 * - Sin credenciales (modo local): el mensaje se guarda en la bandeja "Mensajes" con estado "simulated".
 * - Con WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID: se envía por la WhatsApp Cloud API de Meta
 *   usando plantillas aprobadas con el mismo nombre (ver docs/whatsapp.md).
 */

type Templates = typeof TEMPLATES
export type TemplateName = keyof Templates

export const TEMPLATES = {
  solicitud_recibida: {
    to: 'client',
    params: ['nombre', 'spa', 'servicio', 'fecha', 'hora', 'manicurista'],
    text: 'Hola {nombre} 👋 Recibimos tu solicitud en {spa}: {servicio} el {fecha} a las {hora} con {manicurista}. Te confirmamos por aquí en máximo 2 horas.',
  },
  cita_confirmada: {
    to: 'client',
    params: ['nombre', 'fecha', 'hora', 'manicurista', 'sede', 'direccion'],
    text: '¡Listo, {nombre}! ✅ Tu cita quedó confirmada para el {fecha} a las {hora} con {manicurista} en la sede {sede} ({direccion}). Si necesitas cambiarla, responde a este mensaje.',
  },
  cita_rechazada: {
    to: 'client',
    params: ['nombre', 'fecha', 'hora', 'link'],
    text: 'Hola {nombre}, lo sentimos: no pudimos confirmar tu cita del {fecha} a las {hora}. Puedes elegir otra hora aquí: {link}',
  },
  cita_cancelada: {
    to: 'client',
    params: ['nombre', 'fecha', 'hora', 'link'],
    text: 'Hola {nombre}, tu cita del {fecha} a las {hora} fue cancelada por el spa. Disculpa la molestia. Para reservar de nuevo: {link}',
  },
  cancelada_por_clienta: {
    to: 'client',
    params: ['nombre', 'fecha', 'hora', 'link'],
    text: 'Hola {nombre}, cancelamos tu cita del {fecha} a las {hora} como pediste. Cuando quieras, reserva de nuevo aquí: {link}',
  },
  recordatorio: {
    to: 'client',
    params: ['nombre', 'hora', 'manicurista', 'sede'],
    text: 'Hola {nombre} 💅 Te recordamos tu cita de hoy a las {hora} con {manicurista} en la sede {sede}. ¡Te esperamos!',
  },
  retoque: {
    to: 'client',
    params: ['nombre', 'spa', 'servicio', 'dias', 'link'],
    text: 'Hola {nombre} 💅 Ya van {dias} días desde tu última cita ({servicio}) en {spa}. ¿Agendamos tu retoque? {link}',
  },
  manicurista_nueva_solicitud: {
    to: 'barber',
    params: ['manicurista', 'cliente', 'servicio', 'fecha', 'hora', 'limite'],
    text: '{manicurista}, tienes una nueva solicitud: {cliente} · {servicio} · {fecha} {hora}. Apruébala en la app antes de las {limite}.',
  },
  manicurista_cita_cancelada: {
    to: 'barber',
    params: ['manicurista', 'cliente', 'fecha', 'hora'],
    text: '{manicurista}, {cliente} canceló su cita del {fecha} a las {hora}. Ese espacio quedó libre en tu agenda.',
  },
  dueno_sin_respuesta: {
    to: 'owner',
    params: ['manicurista', 'cliente', 'fecha', 'hora'],
    text: '⚠️ {manicurista} no respondió a tiempo la solicitud de {cliente} para el {fecha} a las {hora}. Revísala en el panel.',
  },
} as const satisfies Record<string, { to: 'client' | 'barber' | 'owner'; params: readonly string[]; text: string }>

export function render(name: TemplateName, vars: Record<string, string>) {
  // "7:00 p. m." al final de una frase: sin punto doble ("p. m.." → "p. m.")
  return TEMPLATES[name].text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '').replace(/([ap]\. m\.)\./g, '$1')
}

export function whatsappMode(): 'cloud_api' | 'simulated' {
  return process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'cloud_api' : 'simulated'
}

export async function sendWhatsApp(
  opts: { tenantId: string; toPhone: string; template: TemplateName; vars: Record<string, string>; appointmentId?: string },
  on?: Queryable,
) {
  const t = TEMPLATES[opts.template]
  const body = render(opts.template, opts.vars)
  let status: 'simulated' | 'sent' | 'failed' = 'simulated'
  let error: string | null = null

  if (whatsappMode() === 'cloud_api') {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '57' + opts.toPhone,
            type: 'template',
            template: {
              name: opts.template,
              language: { code: process.env.WHATSAPP_LANG ?? 'es_CO' },
              components: [{ type: 'body', parameters: t.params.map((p) => ({ type: 'text', text: opts.vars[p] ?? '' })) }],
            },
          }),
        },
      )
      if (res.ok) status = 'sent'
      else {
        status = 'failed'
        error = (await res.text()).slice(0, 500)
      }
    } catch (e) {
      status = 'failed'
      error = String(e).slice(0, 500)
    }
  }

  await one(
    `insert into messages (tenant_id, to_phone, to_kind, template, body, appointment_id, status, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [opts.tenantId, opts.toPhone, t.to, opts.template, body, opts.appointmentId ?? null, status, error],
    on,
  )
  return { status, body }
}
