import { NextResponse } from 'next/server'
import { one } from '@/lib/db'
import { daysOverview, slotsFor, tenantBySlug } from '@/lib/booking'
import { fmtTime, isYmd, todayYmd } from '@/lib/time'

export async function GET(req: Request, ctx: RouteContext<'/api/r/[slug]/availability'>) {
  const { slug } = await ctx.params
  const url = new URL(req.url)
  const t = await tenantBySlug(slug)
  if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const branchId = url.searchParams.get('branch') ?? ''
  const serviceId = url.searchParams.get('service') ?? ''
  const svc = await one<{ duration_min: number }>(
    'select duration_min from services where id = $1 and tenant_id = $2 and active',
    [serviceId, t.id],
  ).catch(() => null)
  if (!svc) return NextResponse.json({ error: 'bad_service' }, { status: 400 })
  const days = await daysOverview(t, branchId, svc.duration_min).catch(() => [])
  let date = url.searchParams.get('date')
  if (!isYmd(date)) date = days.find((d) => d.free > 0)?.ymd ?? todayYmd(t.timezone)
  const slots = await slotsFor(t, { branchId, durationMin: svc.duration_min, ymd: date })
  return NextResponse.json({
    date,
    days,
    slots: slots.map((s) => ({ minutes: s.minutes, start: s.start.toISOString(), label: fmtTime(s.start, t.timezone), barberIds: s.barberIds })),
  })
}
