import { requireUser } from '@/lib/auth'
import { one } from '@/lib/db'
import { runDueJobs } from '@/lib/appointments'
import { TabBar } from './TabBar'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  await runDueJobs()
  const n = await one<{ n: number }>(
    user.role === 'owner'
      ? `select count(*)::int n from appointments where tenant_id = $1 and status = 'pending' and starts_at > now()`
      : `select count(*)::int n from appointments where barber_id = $2 and tenant_id = $1 and status = 'pending' and starts_at > now()`,
    user.role === 'owner' ? [user.tenant_id] : [user.tenant_id, user.id],
  )
  return (
    <>
      <div className="page">{children}</div>
      <TabBar role={user.role} alerts={n?.n ?? 0} />
    </>
  )
}
