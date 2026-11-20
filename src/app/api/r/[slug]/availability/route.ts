import { NextResponse } from 'next/server'
import { BookingError, comboTotals, daysOverview, loadServices, slotsFor, tenantBySlug } from '@/lib/booking'
import { fmtTime, isYmd, todayYmd } from '@/lib/time'

/** Horas libres para uno o varios servicios (`services=id1,id2`; la duración es la suma). */
export async function GET(req: Request, ctx: RouteContext<'/api/r/[slug]/availability'>) {
  const { slug } = await ctx.params
  const url = new URL(req.url)
  const t = await tenantBySlug(slug)
  if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const branchId = url.searchParams.get('branch') ?? ''
  const ids = (url.searchParams.get('services') ?? url.searchParams.get('service') ?? '').split(',').filter(Boolean)
  let durationMin: number
  try {
    durationMin = comboTotals(await loadServices(t.id, ids)).duration
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: 'bad_service' }, { status: 400 })
    throw e
  }
  const days = await daysOverview(t, branchId, durationMin).catch(() => [])
  let date = url.searchParams.get('date')
  if (!isYmd(date)) date = days.find((d) => d.free > 0)?.ymd ?? todayYmd(t.timezone)
  const slots = await slotsFor(t, { branchId, durationMin, ymd: date }).catch(() => [])
  return NextResponse.json({
    date,
    durationMin,
    days,
    slots: slots.map((s) => ({ minutes: s.minutes, start: s.start.toISOString(), label: fmtTime(s.start, t.timezone), barberIds: s.barberIds })),
  })
}
