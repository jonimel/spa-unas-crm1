-- Fase 2: comisiones flexibles por barbero y por servicio, arriendo de silla.

alter table tenants
  add column default_commission_pct numeric(5,2) not null default 45,
  add column tips_to_barber boolean not null default true,
  add column deduct_card_fee boolean not null default false,
  add column card_fee_pct numeric(5,2) not null default 3;

create type pay_model as enum ('percent', 'fixed', 'rent');
create type rent_period as enum ('daily', 'weekly', 'monthly');

-- Esquema de pago de cada barbero (si no tiene fila: porcentaje por defecto de la barbería)
create table barber_pay (
  barber_id    uuid primary key references users(id) on delete cascade,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  model        pay_model not null default 'percent',
  percent      numeric(5,2),                 -- null = usa el porcentaje por defecto
  rent_amount  int,
  rent_period  rent_period,
  updated_at   timestamptz not null default now()
);

-- Excepciones por servicio (modelo porcentaje) o montos por servicio (modelo fijo)
create table barber_service_rates (
  barber_id  uuid not null references users(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kind       text not null check (kind in ('percent', 'fixed')),
  value      numeric(12,2) not null check (value >= 0),
  primary key (barber_id, service_id)
);

-- Lo que le toca a cada uno, congelado al cobrar (cambiar el esquema no altera pagos pasados)
alter table payments
  add column service_id   uuid references services(id),
  add column barber_share int,
  add column barber_tip   int,
  add column shop_share   int,
  add column rule         text;

update payments p set service_id = a.service_id from appointments a where a.id = p.appointment_id;
