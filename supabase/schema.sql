-- Cuaderno docente: esquema de Supabase (generado por tools/gen-sql.mjs, no editar a mano)
--
-- Cómo usarlo: en Supabase abre SQL Editor, pega todo este archivo y presiona Run.
-- Es seguro ejecutarlo más de una vez: no borra datos.
--
-- Seguridad: cada fila pertenece al usuario que la creó (user_id) y las reglas de acceso (RLS)
-- impiden que cualquier otra cuenta la lea o la cambie.

create or replace function public.cuaderno_touch() returns trigger
language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create table if not exists public.secciones (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  nombre text,
  grado text,
  anio_escolar text,
  siguiente_codigo integer default 1
);
create index if not exists secciones_sync on public.secciones (user_id, server_updated_at);
alter table public.secciones enable row level security;
drop policy if exists "solo el dueño" on public.secciones;
create policy "solo el dueño" on public.secciones
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.secciones;
create trigger cuaderno_touch before insert or update on public.secciones
  for each row execute function public.cuaderno_touch();

create table if not exists public.lapsos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  seccion_id uuid,
  numero integer,
  fecha_inicio date,
  fecha_fin date,
  cerrado boolean
);
create index if not exists lapsos_sync on public.lapsos (user_id, server_updated_at);
alter table public.lapsos enable row level security;
drop policy if exists "solo el dueño" on public.lapsos;
create policy "solo el dueño" on public.lapsos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.lapsos;
create trigger cuaderno_touch before insert or update on public.lapsos
  for each row execute function public.cuaderno_touch();

create table if not exists public.estudiantes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  seccion_id uuid,
  numero_lista integer,
  nombre_completo text,
  cedula text,
  fecha_nacimiento date,
  representante_nombre text,
  representante_contacto text,
  necesidades_educativas text,
  observaciones_conducta text,
  codigo_ia text
);
create index if not exists estudiantes_sync on public.estudiantes (user_id, server_updated_at);
alter table public.estudiantes enable row level security;
drop policy if exists "solo el dueño" on public.estudiantes;
create policy "solo el dueño" on public.estudiantes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.estudiantes;
create trigger cuaderno_touch before insert or update on public.estudiantes
  for each row execute function public.cuaderno_touch();

create table if not exists public.asignaturas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  seccion_id uuid,
  nombre text,
  orden integer
);
create index if not exists asignaturas_sync on public.asignaturas (user_id, server_updated_at);
alter table public.asignaturas enable row level security;
drop policy if exists "solo el dueño" on public.asignaturas;
create policy "solo el dueño" on public.asignaturas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.asignaturas;
create trigger cuaderno_touch before insert or update on public.asignaturas
  for each row execute function public.cuaderno_touch();

create table if not exists public.evaluaciones (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  asignatura_id uuid,
  lapso_id uuid,
  nombre text,
  tipo text,
  fecha date
);
create index if not exists evaluaciones_sync on public.evaluaciones (user_id, server_updated_at);
alter table public.evaluaciones enable row level security;
drop policy if exists "solo el dueño" on public.evaluaciones;
create policy "solo el dueño" on public.evaluaciones
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.evaluaciones;
create trigger cuaderno_touch before insert or update on public.evaluaciones
  for each row execute function public.cuaderno_touch();

create table if not exists public.indicadores (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  evaluacion_id uuid,
  texto text,
  etiqueta text,
  orden integer,
  peso numeric
);
create index if not exists indicadores_sync on public.indicadores (user_id, server_updated_at);
alter table public.indicadores enable row level security;
drop policy if exists "solo el dueño" on public.indicadores;
create policy "solo el dueño" on public.indicadores
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.indicadores;
create trigger cuaderno_touch before insert or update on public.indicadores
  for each row execute function public.cuaderno_touch();

create table if not exists public.resultados (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  indicador_id uuid,
  estudiante_id uuid,
  nivel text,
  observacion text
);
create index if not exists resultados_sync on public.resultados (user_id, server_updated_at);
alter table public.resultados enable row level security;
drop policy if exists "solo el dueño" on public.resultados;
create policy "solo el dueño" on public.resultados
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.resultados;
create trigger cuaderno_touch before insert or update on public.resultados
  for each row execute function public.cuaderno_touch();

create table if not exists public.notas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  evaluacion_id uuid,
  estudiante_id uuid,
  nota_calculada integer,
  nota_final integer,
  observacion text
);
create index if not exists notas_sync on public.notas (user_id, server_updated_at);
alter table public.notas enable row level security;
drop policy if exists "solo el dueño" on public.notas;
create policy "solo el dueño" on public.notas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.notas;
create trigger cuaderno_touch before insert or update on public.notas
  for each row execute function public.cuaderno_touch();

create table if not exists public.asistencia (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  estudiante_id uuid,
  fecha date,
  estado text
);
create index if not exists asistencia_sync on public.asistencia (user_id, server_updated_at);
alter table public.asistencia enable row level security;
drop policy if exists "solo el dueño" on public.asistencia;
create policy "solo el dueño" on public.asistencia
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.asistencia;
create trigger cuaderno_touch before insert or update on public.asistencia
  for each row execute function public.cuaderno_touch();

create table if not exists public.recomendaciones (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  asignatura_id uuid,
  indicador_etiqueta text,
  deficiencia text,
  recomendacion text,
  origen text
);
create index if not exists recomendaciones_sync on public.recomendaciones (user_id, server_updated_at);
alter table public.recomendaciones enable row level security;
drop policy if exists "solo el dueño" on public.recomendaciones;
create policy "solo el dueño" on public.recomendaciones
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.recomendaciones;
create trigger cuaderno_touch before insert or update on public.recomendaciones
  for each row execute function public.cuaderno_touch();

create table if not exists public.reportes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  tipo text,
  estudiante_id uuid,
  seccion_id uuid,
  lapso_id uuid,
  texto text,
  generado_con_ia boolean,
  revisado_en timestamptz
);
create index if not exists reportes_sync on public.reportes (user_id, server_updated_at);
alter table public.reportes enable row level security;
drop policy if exists "solo el dueño" on public.reportes;
create policy "solo el dueño" on public.reportes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.reportes;
create trigger cuaderno_touch before insert or update on public.reportes
  for each row execute function public.cuaderno_touch();

create table if not exists public.configuracion (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  umbral_indicador_debil numeric default 50,
  minimo_aprobatorio integer default 10,
  puntos_logrado numeric default 1,
  puntos_en_proceso numeric default 0.5,
  puntos_no_logrado numeric default 0,
  tabla_conversion jsonb,
  hora_aviso text default '16:30',
  dias_aviso integer default 3
);
create index if not exists configuracion_sync on public.configuracion (user_id, server_updated_at);
alter table public.configuracion enable row level security;
drop policy if exists "solo el dueño" on public.configuracion;
create policy "solo el dueño" on public.configuracion
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.configuracion;
create trigger cuaderno_touch before insert or update on public.configuracion
  for each row execute function public.cuaderno_touch();

create table if not exists public.avisos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  tipo text,
  fecha_programada timestamptz,
  referencia_id uuid,
  enviado boolean
);
create index if not exists avisos_sync on public.avisos (user_id, server_updated_at);
alter table public.avisos enable row level security;
drop policy if exists "solo el dueño" on public.avisos;
create policy "solo el dueño" on public.avisos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.avisos;
create trigger cuaderno_touch before insert or update on public.avisos
  for each row execute function public.cuaderno_touch();

create table if not exists public.suscripciones_push (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  endpoint text,
  claves jsonb
);
create index if not exists suscripciones_push_sync on public.suscripciones_push (user_id, server_updated_at);
alter table public.suscripciones_push enable row level security;
drop policy if exists "solo el dueño" on public.suscripciones_push;
create policy "solo el dueño" on public.suscripciones_push
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.suscripciones_push;
create trigger cuaderno_touch before insert or update on public.suscripciones_push
  for each row execute function public.cuaderno_touch();
