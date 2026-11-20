-- La dueña que también hace uñas: con "Yo también atiendo" tiene horario, aparece en las reservas y en Nueva.
-- Lo que cobra es todo del spa (no tiene comisión ni pagos de manicurista).
alter table users add column serves boolean not null default false;
