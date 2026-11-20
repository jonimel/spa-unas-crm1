import { Icon } from '@/components/Icon'
import { Top } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { rows } from '@/lib/db'
import { fmtPhone } from '@/lib/phone'
import { fmtDay, fmtTime } from '@/lib/time'
import { whatsappMode } from '@/lib/whatsapp'

const KIND: Record<string, string> = { client: 'Cliente', barber: 'Manicurista', owner: 'Dueño' }

export default async function Mensajes() {
  const user = await requireUser('owner')
  const msgs = await rows<{ id: string; to_phone: string; to_kind: string; template: string; body: string; status: string; error: string | null; created_at: Date; who: string | null }>(
    `select m.*, coalesce(c.name, u.name) who
       from messages m
       left join clients c on c.tenant_id = m.tenant_id and c.phone = m.to_phone and m.to_kind = 'client'
       left join users u on u.tenant_id = m.tenant_id and u.phone = m.to_phone and m.to_kind <> 'client'
      where m.tenant_id = $1 order by m.created_at desc limit 100`,
    [user.tenant_id],
  )
  const mode = whatsappMode()
  return (
    <main>
      <Top title="WhatsApp" sub="Mensajes automáticos enviados" back="/app/ajustes" />
      {mode === 'simulated' ? (
        <div className="note" style={{ marginTop: 8 }}>
          <b>Modo de prueba.</b> Los mensajes no salen a WhatsApp todavía: se guardan aquí para que veas exactamente qué recibiría cada persona. Al conectar la cuenta de WhatsApp Business se envían de verdad.
        </div>
      ) : (
        <div className="card row" style={{ marginTop: 8 }}>
          <span className="wa-badge">
            <Icon name="wa" /> Conectado a WhatsApp Business
          </span>
        </div>
      )}
      <div className="stack" style={{ marginTop: 14 }}>
        {msgs.length === 0 && <div className="empty">Aún no se ha enviado ningún mensaje.</div>}
        {msgs.map((m) => (
          <div key={m.id}>
            <div className="row small muted" style={{ marginBottom: 5 }}>
              <span className="grow">
                {KIND[m.to_kind]} · {m.who ?? fmtPhone(m.to_phone)}
              </span>
              <span>
                {fmtDay(new Date(m.created_at), user.timezone)} {fmtTime(new Date(m.created_at), user.timezone)}
              </span>
            </div>
            <div className="bubble">
              {m.body}
              <small>{m.status === 'simulated' ? 'simulado' : m.status === 'sent' ? 'enviado ✓' : `falló: ${m.error ?? ''}`}</small>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
