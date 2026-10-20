// Genera supabase/schema.sql a partir de app/js/schema.js
// Uso: cd tools && node gen-sql.mjs
import { writeFileSync } from 'node:fs';
import { TABLES, COMMON_COLS } from '../app/js/schema.js';

const SQL_TYPES = { text: 'text', int: 'integer', num: 'numeric', bool: 'boolean', date: 'date', ts: 'timestamptz', json: 'jsonb', uuid: 'uuid' };

let out = `-- Cuaderno docente: esquema de Supabase (generado por tools/gen-sql.mjs, no editar a mano)
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
`;

for (const [name, t] of Object.entries(TABLES)) {
  const cols = [
    '  id uuid primary key',
    '  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade',
    '  created_at timestamptz not null default now()',
    '  updated_at timestamptz not null default now()',
    '  server_updated_at timestamptz not null default now()',
    '  deleted boolean not null default false',
  ];
  for (const [c, type] of Object.entries(t.cols)) {
    if (c in COMMON_COLS) continue;
    let def = `  ${c} ${SQL_TYPES[type]}`;
    if (name === 'secciones' && c === 'siguiente_codigo') def += ' default 1';
    if (name === 'configuracion') {
      const d = { umbral_indicador_debil: '50', minimo_aprobatorio: '10', puntos_logrado: '1', puntos_en_proceso: '0.5', puntos_no_logrado: '0', dias_aviso: '3' }[c];
      if (d) def += ` default ${d}`;
      if (c === 'hora_aviso') def += " default '16:30'";
    }
    cols.push(def);
  }
  out += `
create table if not exists public.${name} (
${cols.join(',\n')}
);
create index if not exists ${name}_sync on public.${name} (user_id, server_updated_at);
alter table public.${name} enable row level security;
grant select, insert, update, delete on public.${name} to authenticated;
drop policy if exists "solo el dueño" on public.${name};
create policy "solo el dueño" on public.${name}
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop trigger if exists cuaderno_touch on public.${name};
create trigger cuaderno_touch before insert or update on public.${name}
  for each row execute function public.cuaderno_touch();
`;
}

writeFileSync(new URL('../supabase/schema.sql', import.meta.url), out);
console.log('supabase/schema.sql generado con', Object.keys(TABLES).length, 'tablas');
