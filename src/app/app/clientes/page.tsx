import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar, Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { rows } from '@/lib/db'
import { fmtPhone } from '@/lib/phone'
import { fmtDay } from '@/lib/time'

export default async function Clientes({ searchParams }: PageProps<'/app/clientes'>) {
  const user = await requireUser()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const digits = q.replace(/\D/g, '')
  const params: unknown[] = [user.tenant_id]
  let filter = ''
  if (q) {
    params.push(`%${q.toLowerCase()}%`)
    filter = `and (lower(c.name) like $2${digits.length >= 3 ? ` or c.phone like $3` : ''})`
    if (digits.length >= 3) params.push(`%${digits}%`)
  }
  // la manicurista ve todos los clientes del spa (para reconocer a quien llega), pero sin montos
  const list = await rows<{ id: string; name: string; phone: string | null; visits: number; last: Date | null }>(
    `select c.id, c.name, c.phone,
            count(a.id) filter (where a.status = 'completed')::int visits,
            max(a.starts_at) filter (where a.status = 'completed') last
       from clients c left join appointments a on a.client_id = c.id
      where c.tenant_id = $1 ${filter}
      group by c.id order by last desc nulls last, c.name limit 100`,
    params,
  )
  return (
    <main>
      <Top title="Clientes" sub={`${list.length}${list.length === 100 ? '+' : ''} ${q ? 'encontrados' : 'en total'}`} />
      <form className="field" style={{ marginTop: 6 }}>
        <div className="in">
          <Icon name="search" style={{ color: 'var(--muted)' }} />
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o celular" type="search" aria-label="Buscar cliente" />
        </div>
      </form>
      <div className="list" style={{ marginTop: 8 }}>
        {list.length === 0 && <div className="empty">No encontramos clientes{q ? ` con “${q}”` : ''}.</div>}
        {list.map((c) => (
          <Link key={c.id} href={`/app/clientes/${c.id}`} className="li">
            <Avatar name={c.name} sm />
            <div className="grow">
              <div className="t">{c.name}</div>
              <div className="small muted">{c.phone ? fmtPhone(c.phone) : 'Sin celular'}</div>
            </div>
            <div className="right small muted">
              <div>
                {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
              </div>
              {c.last && <div>{fmtDay(new Date(c.last), user.timezone)}</div>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
