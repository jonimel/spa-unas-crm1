-- Fase 2.1: pagos a los barberos (cuenta corriente de cada uno).
-- pago / adelanto: la barbería le paga al barbero (baja lo que se le debe).
-- arriendo: el barbero de silla le paga el arriendo a la barbería.

create type payout_kind as enum ('pago', 'adelanto', 'arriendo');

create table barber_payouts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  barber_id  uuid not null references users(id),
  kind       payout_kind not null,
  amount     int not null check (amount > 0),
  method     pay_method not null,
  paid_on    date not null,
  note       text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  voided_at  timestamptz,               -- anulado (se guarda para el historial)
  voided_by  uuid references users(id)
);
create index on barber_payouts (tenant_id, barber_id, paid_on);

-- La cuenta de cada barbero empieza hoy para las barberías que ya venían usando el sistema:
-- lo que ganaron antes se da por pagado (se les pagaba por fuera).
alter table tenants add column ledger_start timestamptz not null default now();

-- desde cuándo corre el arriendo de silla (se cobra por periodo empezado)
alter table barber_pay add column rent_since date;
update barber_pay set rent_since = updated_at::date where model = 'rent';
