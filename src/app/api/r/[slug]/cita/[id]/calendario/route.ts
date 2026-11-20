import { apptView, bookingLink } from '@/lib/booking'
import { isUuid } from '@/lib/validate'
import { appointmentIcs } from '@/lib/ics'

const UUID = { test: isUuid }

/** "Agregar a mi calendario": descarga la cita como .ics. */
export async function GET(_req: Request, ctx: RouteContext<'/api/r/[slug]/cita/[id]/calendario'>) {
  const { slug, id } = await ctx.params
  const a = UUID.test(id) ? await apptView(id) : null
  if (!a || a.tenant_slug !== slug || !['pending', 'confirmed'].includes(a.status)) return new Response('Cita no encontrada', { status: 404 })
  const body = appointmentIcs(a, `${bookingLink(slug)}/cita/${id}`)
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cita-${slug}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
