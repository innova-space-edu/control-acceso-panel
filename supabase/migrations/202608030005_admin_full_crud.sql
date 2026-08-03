-- Control de Acceso Escolar · Permisos CRUD completos para administración
-- Ejecutar después de las migraciones 001 a 004.
-- Mantiene RLS activa: solamente perfiles administrativos autenticados pueden operar.

create or replace function public.es_admin_escritura()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.activo = true
      and p.rol in ('superadmin', 'administrador', 'seguridad', 'utp', 'inspectoria')
  );
$$;

create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.activo = true
      and p.rol = 'superadmin'
  );
$$;

-- Garantiza que la cuenta administrativa principal tenga perfil activo.
insert into public.admin_profiles (user_id, nombre, rol, activo)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.email, 'Administrador'),
  'superadmin',
  true
from auth.users u
where lower(u.email) = lower('admin@colprovidencia.cl')
on conflict (user_id) do update
set nombre = coalesce(excluded.nombre, public.admin_profiles.nombre),
    rol = 'superadmin',
    activo = true,
    actualizado_en = now();

-- Agrega políticas administrativas sin eliminar políticas de kioscos, agentes
-- u otros servicios. Las políticas admin_* se recrean de forma idempotente.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'admin_profiles',
    'estudiantes',
    'docentes',
    'notebooks',
    'accesos',
    'alertas',
    'sesiones_activas',
    'solicitudes_override',
    'examenes_kiosk',
    'eventos_sistema',
    'incidencias',
    'incidencia_eventos',
    'dispositivos_estado',
    'dispositivos_heartbeats',
    'comandos_lotes',
    'comandos_remotos',
    'notificaciones'
  ] loop
    if to_regclass(format('public.%I', tabla)) is not null then
      execute format('alter table public.%I enable row level security', tabla);

      execute format('drop policy if exists admin_select on public.%I', tabla);
      execute format('drop policy if exists admin_insert on public.%I', tabla);
      execute format('drop policy if exists admin_update on public.%I', tabla);
      execute format('drop policy if exists admin_delete on public.%I', tabla);

      if tabla = 'admin_profiles' then
        execute format(
          'create policy admin_select on public.%I for select to authenticated using (public.es_admin())',
          tabla
        );
        execute format(
          'create policy admin_insert on public.%I for insert to authenticated with check (public.es_superadmin())',
          tabla
        );
        execute format(
          'create policy admin_update on public.%I for update to authenticated using (public.es_superadmin()) with check (public.es_superadmin())',
          tabla
        );
        execute format(
          'create policy admin_delete on public.%I for delete to authenticated using (public.es_superadmin())',
          tabla
        );
      else
        execute format(
          'create policy admin_select on public.%I for select to authenticated using (public.es_admin())',
          tabla
        );
        execute format(
          'create policy admin_insert on public.%I for insert to authenticated with check (public.es_admin_escritura())',
          tabla
        );
        execute format(
          'create policy admin_update on public.%I for update to authenticated using (public.es_admin_escritura()) with check (public.es_admin_escritura())',
          tabla
        );
        execute format(
          'create policy admin_delete on public.%I for delete to authenticated using (public.es_admin_escritura())',
          tabla
        );
      end if;

      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        tabla
      );
    end if;
  end loop;
end $$;

-- Permisos para columnas identity/serial utilizadas al insertar registros.
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

grant execute on function public.es_admin_escritura() to authenticated;
grant execute on function public.es_superadmin() to authenticated;

-- Mejora el filtrado de estudiantes por curso y nombre.
create index if not exists idx_estudiantes_curso_nombre
  on public.estudiantes (curso, nombre);
