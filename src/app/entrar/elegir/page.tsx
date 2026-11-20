import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@/components/Icon'
import { Avatar } from '@/components/ui'
import { currentUser, finishPick, pendingPick } from '@/lib/auth'
import { rows } from '@/lib/db'

export const metadata = { title: 'Entrar · ¿Con quién?' }

async function pick(fd: FormData) {
  'use server'
  redirect((await finishPick(String(fd.get('id') ?? ''))) ? '/app' : '/entrar')
}

// Después de la entrada común de la demo (1111 / 1111): elegir con cuál usuario entrar.
export default async function Elegir() {
  if (await currentUser()) redirect('/app')
  const ids = await pendingPick()
  if (!ids) redirect('/entrar')
  const people = await rows<{ id: string; name: string; role: string; branch: string | null }>(
    `select u.id, u.name, u.role, b.name branch from users u left join branches b on b.id = u.branch_id
      where u.id = any($1) and u.active order by u.name`,
    [ids],
  )
  return (
    <main className="page">
      <div className="top">
        <Link className="back" href="/entrar" aria-label="Volver">
          <Icon name="back" />
        </Link>
      </div>
      <h2 className="hero-title" style={{ fontSize: 34, textAlign: 'center' }}>
        ¿Con quién entras?
      </h2>
      <p className="muted small" style={{ textAlign: 'center', margin: '-4px 0 6px' }}>
        Elige tu nombre
      </p>
      <div className="stack" style={{ marginTop: 14 }}>
        {people.map((p) => (
          <form key={p.id} action={pick}>
            <input type="hidden" name="id" value={p.id} />
            <button className="role" type="submit">
              <Avatar name={p.name} />
              <span className="grow">
                <b>{p.name}</b>
                <span>{p.role === 'owner' ? 'Dueña / Administración' : `Manicurista${p.branch ? ' · ' + p.branch : ''}`}</span>
              </span>
              <Icon name="back" style={{ transform: 'scaleX(-1)' }} />
            </button>
          </form>
        ))}
      </div>
    </main>
  )
}
