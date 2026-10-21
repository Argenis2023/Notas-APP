-- Reporte semanal por correo: preferencias de cada docente y programador (cada hora).
-- Se ejecuta una vez en Supabase > SQL Editor.

create table if not exists public.reporte_semanal_pref (
  user_id uuid primary key references auth.users (id) on delete cascade,
  activo boolean not null default false,
  dia int not null default 5 check (dia between 1 and 7),      -- 1 = lunes ... 7 = domingo
  hora int not null default 16 check (hora between 0 and 23),  -- hora de Venezuela
  ultimo_envio timestamptz,
  ultimo_error text,
  manuales_fecha date,
  manuales_n int not null default 0
);
-- Sin reglas de acceso a propósito: solo la función del servidor puede leer o escribir estas tablas.
alter table public.reporte_semanal_pref enable row level security;

create table if not exists public.reporte_semanal_cron (secreto text not null);
alter table public.reporte_semanal_cron enable row level security;
insert into public.reporte_semanal_cron (secreto)
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where not exists (select 1 from public.reporte_semanal_cron);

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('reporte-semanal-cada-hora') where exists (select 1 from cron.job where jobname = 'reporte-semanal-cada-hora');
select cron.schedule(
  'reporte-semanal-cada-hora',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://fdcqylowhqyqxebiqmnn.supabase.co/functions/v1/reporte-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secreto from public.reporte_semanal_cron limit 1)),
    body := '{"accion":"cron"}'::jsonb
  );
  $$
);
