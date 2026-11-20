-- Barbar CRM: esquema inicial (multi-tenant: cada fila lleva tenant_id).
-- Escrito para PostgreSQL; corre igual en PGlite (local) y en Supabase/Postgres (producción).

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  city        text,
  timezone    text not null default 'America/Bogota',
  currency    text not null default 'COP',
  -- reglas de reserva
  min_notice_min      int not null default 60,   -- reserva online: mínimo 1 h de anticipación
  approval_window_min int not null default 120,  -- el barbero tiene 2 h para aprobar
  approval_cutoff_min int not null default 30,   -- ...o hasta 30 min antes de la cita, lo que llegue primero
  reminder_before_min int not null default 120,  -- recordatorio por WhatsApp 2 h antes
  slot_step_min       int not null default 30,
  booking_days_ahead  int not null default 14,
  created_at  timestamptz not null default now()
);

create table branches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  address    text,
  phone      text,
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index on branches (tenant_id);

create type user_role as enum ('owner', 'barber');

create table users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role        user_role not null,
  name        text not null,
  phone       text not null,           -- 10 dígitos, sin +57
  pin_hash    text not null,
  branch_id   uuid references branches(id) on delete set null, -- sede principal del barbero
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index on users (tenant_id);

create table sessions (
  token      text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table services (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  description  text,
  duration_min int not null check (duration_min > 0),
  price        int not null check (price >= 0),  -- pesos colombianos, sin decimales
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index on services (tenant_id);

-- Horario semanal de cada barbero (weekday: 0 = domingo ... 6 = sábado; minutos desde medianoche, hora local)
create table working_hours (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  barber_id uuid not null references users(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  weekday   int not null check (weekday between 0 and 6),
  start_min int not null check (start_min between 0 and 1440),
  end_min   int not null check (end_min between 0 and 1440),
  check (end_min > start_min)
);
create index on working_hours (barber_id, weekday);

create table time_off (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  barber_id uuid not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (ends_at > starts_at)
);
create index on time_off (barber_id, starts_at);

create table clients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  phone      text,                       -- puede faltar en un cliente de paso
  notes      text,
  created_at timestamptz not null default now()
);
create unique index clients_tenant_phone on clients (tenant_id, phone) where phone is not null;

create type appt_status as enum ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show');
create type appt_source as enum ('online', 'walkin', 'staff');

create table appointments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  branch_id         uuid not null references branches(id),
  barber_id         uuid not null references users(id),
  client_id         uuid not null references clients(id),
  service_id        uuid not null references services(id),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            appt_status not null default 'pending',
  source            appt_source not null default 'online',
  price             int not null,
  client_note       text,
  approval_deadline timestamptz,           -- solo para pendientes
  owner_alerted_at  timestamptz,           -- cuando se avisó al dueño que el barbero no respondió
  reminder_sent_at  timestamptz,
  decided_at        timestamptz,
  decided_by        uuid references users(id),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on appointments (tenant_id, starts_at);
create index on appointments (barber_id, starts_at);
create index on appointments (client_id);
create index on appointments (status, approval_deadline);

create type pay_method as enum ('efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia');

create table payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  appointment_id uuid unique references appointments(id) on delete set null,
  branch_id      uuid not null references branches(id),
  barber_id      uuid not null references users(id),
  client_id      uuid not null references clients(id),
  amount         int not null check (amount >= 0),
  tip            int not null default 0 check (tip >= 0),
  method         pay_method not null,
  paid_at        timestamptz not null default now(),
  created_by     uuid references users(id)
);
create index on payments (tenant_id, paid_at);

-- Bandeja de salida de WhatsApp. En local se guardan como "simulated"; con la API de Meta, "sent"/"failed".
create table messages (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  to_phone       text not null,
  to_kind        text not null check (to_kind in ('client', 'barber', 'owner')),
  template       text not null,
  body           text not null,
  appointment_id uuid references appointments(id) on delete set null,
  status         text not null default 'simulated' check (status in ('simulated', 'sent', 'failed')),
  error          text,
  created_at     timestamptz not null default now()
);
create index on messages (tenant_id, created_at desc);

-- Avisos dentro de la app (p. ej. "Andrés no aprobó a tiempo")
create table alerts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  kind           text not null,
  title          text not null,
  appointment_id uuid references appointments(id) on delete cascade,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index on alerts (user_id, read_at);
