import { NextResponse } from 'next/server'
import { one } from '@/lib/db'
import { tenantBySlug } from '@/lib/booking'
import { normalizeCoPhone } from '@/lib/phone'

/** "¡Hola de nuevo!": si el celular ya es cliente, devolvemos solo el nombre y la inicial del apellido. */
// freno simple para que nadie recorra celulares a ver cuáles son clientas: 20 consultas por minuto por dirección
const hits = new Map<string, { n: number; until: number }>()
function limited(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local'
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.until < now) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, until: now + 60_000 })
    return false
  }
  return ++h.n > 20
}

export async function GET(req: Request, ctx: RouteContext<'/api/r/[slug]/client'>) {
  if (limited(req)) return NextResponse.json({ known: false }, { status: 429 })
  const { slug } = await ctx.params
  const phone = normalizeCoPhone(new URL(req.url).searchParams.get('phone') ?? '')
  const t = await tenantBySlug(slug)
  if (!t || !phone) return NextResponse.json({ known: false })
  const c = await one<{ name: string }>('select name from clients where tenant_id = $1 and phone = $2', [t.id, phone])
  if (!c) return NextResponse.json({ known: false })
  const parts = c.name.trim().split(/\s+/)
  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  return NextResponse.json({ known: true, name: short })
}
