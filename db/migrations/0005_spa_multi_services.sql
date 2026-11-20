-- Spa de uñas: varios servicios por cita, adicionales, ficha de la clienta y recordatorio de retoque.
-- Los nombres internos de las columnas (barber_id, barber_pay, …) se mantienen: en la app y en los
-- textos la persona que atiende es la "manicurista".

-- Servicios: "adicional" (retiro, nail art, reparación…) y cada cuántos días toca el retoque.
alter table services
  add column is_addon    boolean not null default false,
  add column refill_days int check (refill_days is null or refill_days between 1 and 365);

-- Ficha de la clienta: colores/tonos favoritos y alergias o sensibilidades (se le muestran al equipo en la agenda).
alter table clients
  add column favorite_colors text,
  add column allergies       text;

-- Los servicios de cada cita (una línea por servicio). appointments.price = suma de price,
-- appointments.ends_at = starts_at + suma de duration_min. appointments.service_id queda como el servicio principal (la primera línea).
-- Al cobrar, el valor cobrado se reparte entre las líneas (charged) y la comisión se calcula por línea (barber_share, rule).
create table appointment_services (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_id     uuid references services(id) on delete set null,
  name           text not null,           -- nombre al momento de reservar
  duration_min   int not null check (duration_min > 0),
  price          int not null check (price >= 0),
  is_addon       boolean not null default false,
  sort           int not null default 0,
  charged        int,                     -- parte del valor cobrado que corresponde a esta línea
  barber_share   int,                     -- lo de la manicurista por esta línea
  rule           text
);
create index on appointment_services (appointment_id);
create index on appointment_services (tenant_id, service_id);

-- Citas que ya existían: una línea con su servicio
insert into appointment_services (tenant_id, appointment_id, service_id, name, duration_min, price, is_addon, sort, charged, barber_share, rule)
select a.tenant_id, a.id, a.service_id, s.name,
       greatest(1, round(extract(epoch from (a.ends_at - a.starts_at)) / 60))::int,
       a.price, false, 0, p.amount, p.barber_share, p.rule
  from appointments a
  join services s on s.id = a.service_id
  left join payments p on p.appointment_id = a.id;

-- Recordatorio de retoque por WhatsApp: se agenda al cobrar una cita con un servicio que tiene refill_days.
-- Se envía en la fecha si la clienta no tiene otra cita después; si la tiene, queda como omitido.
create table refill_reminders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  service_name   text not null,
  due_at         timestamptz not null,
  sent_at        timestamptz,
  skipped_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index on refill_reminders (due_at) where sent_at is null and skipped_at is null;
create index on refill_reminders (client_id);

-- "Arriendo de silla" pasa a "Arriendo de puesto" (la regla guardada identifica esos cobros en la cuenta de cada una)
update payments set rule = 'Arriendo de puesto: 100% para la manicurista' where rule = 'Arriendo de silla: 100% para el barbero';
update appointment_services set rule = 'Arriendo de puesto: 100% para la manicurista' where rule = 'Arriendo de silla: 100% para el barbero';
