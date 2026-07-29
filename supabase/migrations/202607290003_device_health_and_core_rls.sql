-- Revisión final de Control de Acceso V2
-- 1) Ejecuta la supervisión de dispositivos cada 5 minutos desde Supabase Cron.
-- 2) Impide que el rol solo_lectura modifique tablas maestras administradas desde el panel.

create extension if not exists pg_cron;

create or replace function public.procesar_salud_dispositivos()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dispositivo record;
  equipos_offline integer := 0;
  comandos_expirados integer := 0;
  incidencias_creadas integer := 0;
begin
  -- Solo registra el cambio una vez: la condición online=true evita eventos duplicados.
  for dispositivo in
    update public.dispositivos_estado
       set online = false,
           actualizado_en = now()
     where online = true
       and ultima_senal is not null
       and ultima_senal < now() - interval '5 minutes'
     returning notebook_id, ultima_senal
  loop
    equipos_offline := equipos_offline + 1;

    insert into public.eventos_sistema (
      categoria,
      tipo_evento,
      severidad,
      resultado,
      descripcion,
      notebook_id,
      origen,
      datos
    ) values (
      'dispositivo',
      'dispositivo_sin_senal',
      'media',
      'offline',
      'El dispositivo dejó de reportar por más de 5 minutos',
      dispositivo.notebook_id,
      'supabase_cron',
      jsonb_build_object('ultima_senal', dispositivo.ultima_senal)
    );
  end loop;

  update public.comandos_remotos
     set estado = 'expirado'
   where estado in ('pendiente', 'enviado', 'recibido')
     and expira_en < now();
  get diagnostics comandos_expirados = row_count;

  for dispositivo in
    select estado.notebook_id, estado.ultima_senal
      from public.dispositivos_estado estado
     where estado.ultima_senal is not null
       and estado.ultima_senal < now() - interval '24 hours'
  loop
    if not exists (
      select 1
        from public.incidencias incidencia
       where incidencia.notebook_id = dispositivo.notebook_id
         and incidencia.tipo = 'equipo_sin_senal_prolongada'
         and incidencia.estado not in ('resuelta', 'falsa_alarma')
    ) then
      insert into public.incidencias (
        titulo,
        descripcion,
        tipo,
        severidad,
        estado,
        notebook_id,
        datos
      ) values (
        'Equipo sin señal prolongada',
        dispositivo.notebook_id || ' no ha reportado durante más de 24 horas.',
        'equipo_sin_senal_prolongada',
        'alta',
        'nueva',
        dispositivo.notebook_id,
        jsonb_build_object('ultima_senal', dispositivo.ultima_senal, 'origen', 'supabase_cron')
      );
      incidencias_creadas := incidencias_creadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'equipos_offline', equipos_offline,
    'comandos_expirados', comandos_expirados,
    'incidencias_creadas', incidencias_creadas,
    'ejecutado_en', now()
  );
end;
$$;

revoke all on function public.procesar_salud_dispositivos() from public;
revoke all on function public.procesar_salud_dispositivos() from anon;
revoke all on function public.procesar_salud_dispositivos() from authenticated;

-- Supabase Cron permite frecuencia de cinco minutos aunque el proyecto Vercel use plan Hobby.
-- Programar nuevamente con el mismo nombre actualiza el trabajo existente.
select cron.schedule(
  'control-acceso-device-health-5m',
  '*/5 * * * *',
  'select public.procesar_salud_dispositivos();'
);

-- Las políticas RESTRICTIVE se combinan con cualquier política permisiva existente.
-- Así un perfil solo_lectura no puede aprovechar una política antigua demasiado amplia.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'estudiantes',
    'docentes',
    'notebooks',
    'examenes_kiosk'
  ] loop
    if to_regclass(format('public.%I', tabla)) is not null then
      execute format('alter table public.%I enable row level security', tabla);

      execute format('drop policy if exists solo_admin_insert on public.%I', tabla);
      execute format('drop policy if exists solo_admin_update on public.%I', tabla);
      execute format('drop policy if exists solo_admin_delete on public.%I', tabla);

      execute format(
        'create policy solo_admin_insert on public.%I as restrictive for insert to authenticated with check (public.es_admin_escritura())',
        tabla
      );
      execute format(
        'create policy solo_admin_update on public.%I as restrictive for update to authenticated using (public.es_admin_escritura()) with check (public.es_admin_escritura())',
        tabla
      );
      execute format(
        'create policy solo_admin_delete on public.%I as restrictive for delete to authenticated using (public.es_admin_escritura())',
        tabla
      );
    end if;
  end loop;
end $$;
