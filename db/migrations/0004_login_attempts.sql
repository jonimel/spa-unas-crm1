-- Intentos fallidos de entrar, por celular: después de 5 PIN incorrectos seguidos se bloquea 10 minutos.
create table login_attempts (
  phone         text primary key,
  fails         int not null default 0,
  first_fail_at timestamptz not null default now(),
  locked_until  timestamptz
);
