-- Sincronización Realtime y rendimiento para Control de Acceso V2
-- Ejecutar después de las migraciones 001, 002 y 003.

-- Índices usados por el panel, los desbloqueos masivos y los kioscos.
create index if not exists idx_override_estado_creado
  on public.solicitudes_override (estado, creado_en desc);

create index if not exists idx_override_notebook_estado
  on public.solicitudes_override (notebook_id, estado);

create index if not exists idx_sesiones_notebook
  on public.sesiones_activas (notebook_id);

create index if not exists idx_examenes_estado_sala
  on public.examenes_kiosk (estado, sala, created_at desc);

create index if not exists idx_accesos_inicio_resultado
  on public.accesos (timestamp_inicio desc, resultado);

-- El panel se suscribe a estas tablas. Se agregan de forma segura a la
-- publicación de Supabase Realtime, sin fallar cuando ya estaban incluidas.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'accesos',
    'alertas',
    'sesiones_activas',
    'solicitudes_override',
    'notebooks',
    'estudiantes',
    'docentes',
    'examenes_kiosk',
    'eventos_sistema',
    'incidencias',
    'dispositivos_estado',
    'comandos_remotos',
    'notificaciones'
  ] loop
    if to_regclass(format('public.%I', tabla)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = tabla
       ) then
      execute format('alter publication supabase_realtime add table public.%I', tabla);
    end if;
  end loop;
end $$;

-- Diagnóstico simple para confirmar desde el panel que las tablas centrales
-- existen y que Realtime tiene todas las tablas requeridas.
create or replace function public.control_acceso_sync_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with required_tables(name) as (
    values
      ('accesos'), ('alertas'), ('sesiones_activas'), ('solicitudes_override'),
      ('notebooks'), ('estudiantes'), ('docentes'), ('examenes_kiosk'),
      ('eventos_sistema'), ('incidencias'), ('dispositivos_estado'),
      ('comandos_remotos'), ('notificaciones')
  ), status as (
    select
      name,
      to_regclass(format('public.%I', name)) is not null as exists_in_schema,
      exists (
        select 1
        from pg_publication_tables p
        where p.pubname = 'supabase_realtime'
          and p.schemaname = 'public'
          and p.tablename = name
      ) as realtime_enabled
    from required_tables
  )
  select jsonb_build_object(
    'ok', bool_and(exists_in_schema and realtime_enabled),
    'checked_at', now(),
    'tables', jsonb_object_agg(
      name,
      jsonb_build_object(
        'exists', exists_in_schema,
        'realtime', realtime_enabled
      )
      order by name
    )
  )
  from status;
$$;

revoke all on function public.control_acceso_sync_health() from public;
grant execute on function public.control_acceso_sync_health() to authenticated;
