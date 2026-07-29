-- Control de Acceso Escolar · Centro de control, auditoría y seguridad
-- Ejecutar en Supabase SQL Editor o mediante Supabase CLI.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Perfiles administrativos
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text not null default 'administrador'
    check (rol in ('superadmin','administrador','seguridad','utp','inspectoria','solo_lectura')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

insert into public.admin_profiles (user_id, nombre, rol)
select id, coalesce(raw_user_meta_data->>'full_name', email, 'Administrador'), 'superadmin'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = auth.uid() and p.activo = true
  );
$$;

create or replace function public.nombre_admin_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.nombre from public.admin_profiles p where p.user_id = auth.uid()),
    (select u.raw_user_meta_data->>'full_name' from auth.users u where u.id = auth.uid()),
    (select u.email from auth.users u where u.id = auth.uid()),
    'Sistema'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Registro central de eventos
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.eventos_sistema (
  id uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz not null default now(),
  fecha_hora_dispositivo timestamptz,
  categoria text not null,
  tipo_evento text not null,
  severidad text not null default 'informativa'
    check (severidad in ('informativa','baja','media','alta','critica')),
  resultado text not null default 'registrado',
  descripcion text,
  actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_nombre text,
  actor_rol text,
  rut_usuario text,
  nombre_usuario text,
  notebook_id text,
  sala text,
  curso text,
  sesion_id text,
  incidencia_id uuid,
  examen_id uuid,
  comando_id uuid,
  ip_local inet,
  ip_public inet,
  correlation_id uuid default gen_random_uuid(),
  origen text not null default 'panel',
  datos jsonb not null default '{}'::jsonb
);

create index if not exists idx_eventos_fecha on public.eventos_sistema(fecha_hora desc);
create index if not exists idx_eventos_categoria on public.eventos_sistema(categoria, fecha_hora desc);
create index if not exists idx_eventos_notebook on public.eventos_sistema(notebook_id, fecha_hora desc);
create index if not exists idx_eventos_rut on public.eventos_sistema(rut_usuario, fecha_hora desc);
create index if not exists idx_eventos_severidad on public.eventos_sistema(severidad, fecha_hora desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Incidencias
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  source_alert_id text unique,
  titulo text not null,
  descripcion text,
  tipo text not null default 'seguridad',
  severidad text not null default 'media'
    check (severidad in ('informativa','baja','media','alta','critica')),
  estado text not null default 'nueva'
    check (estado in ('nueva','en_revision','asignada','accion_ejecutada','resuelta','falsa_alarma')),
  notebook_id text,
  rut text,
  sala text,
  asignada_a uuid references auth.users(id) on delete set null,
  asignada_nombre text,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references auth.users(id) on delete set null,
  resuelta_por_nombre text,
  resolucion text,
  datos jsonb not null default '{}'::jsonb
);

create table if not exists public.incidencia_eventos (
  id uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.incidencias(id) on delete cascade,
  evento_id uuid references public.eventos_sistema(id) on delete set null,
  comentario text,
  creado_por uuid references auth.users(id) on delete set null default auth.uid(),
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_incidencias_estado on public.incidencias(estado, severidad, creada_en desc);
create index if not exists idx_incidencias_notebook on public.incidencias(notebook_id, creada_en desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Inventario y presencia en línea
-- ─────────────────────────────────────────────────────────────────────────────
alter table if exists public.notebooks add column if not exists codigo_inventario text;
alter table if exists public.notebooks add column if not exists numero_serie text;
alter table if exists public.notebooks add column if not exists marca text;
alter table if exists public.notebooks add column if not exists modelo text;
alter table if exists public.notebooks add column if not exists hostname text;
alter table if exists public.notebooks add column if not exists sistema_operativo text;
alter table if exists public.notebooks add column if not exists version_agente text;
alter table if exists public.notebooks add column if not exists mac_address text;
alter table if exists public.notebooks add column if not exists responsable text;
alter table if exists public.notebooks add column if not exists observacion text;
alter table if exists public.notebooks add column if not exists fecha_ultima_mantencion date;
alter table if exists public.notebooks add column if not exists estado_seguridad text default 'normal';
alter table if exists public.notebooks add column if not exists fecha_modo_robado timestamptz;
alter table if exists public.notebooks add column if not exists agente_token_hash text;
alter table if exists public.notebooks add column if not exists agente_activo boolean default false;

create unique index if not exists idx_notebooks_serie on public.notebooks(numero_serie) where numero_serie is not null;
create unique index if not exists idx_notebooks_token on public.notebooks(agente_token_hash) where agente_token_hash is not null;

create table if not exists public.dispositivos_estado (
  notebook_id text primary key references public.notebooks(id) on delete cascade,
  online boolean not null default false,
  ultima_senal timestamptz,
  ip_local inet,
  ip_public inet,
  hostname text,
  red text,
  sistema_operativo text,
  version_agente text,
  usuario_sistema text,
  bateria smallint check (bateria between 0 and 100),
  conectado_corriente boolean,
  tiempo_encendido_segundos bigint,
  kiosk_activo boolean,
  examen_activo boolean,
  latencia_ms integer,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.dispositivos_heartbeats (
  id bigint generated always as identity primary key,
  notebook_id text not null references public.notebooks(id) on delete cascade,
  recibido_en timestamptz not null default now(),
  fecha_hora_dispositivo timestamptz,
  ip_local inet,
  ip_public inet,
  hostname text,
  red text,
  usuario_sistema text,
  bateria smallint,
  kiosk_activo boolean,
  examen_activo boolean,
  cambios jsonb not null default '{}'::jsonb
);

create index if not exists idx_heartbeat_notebook_fecha on public.dispositivos_heartbeats(notebook_id, recibido_en desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Comandos remotos y operaciones masivas
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.comandos_lotes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  motivo text,
  solicitado_por uuid references auth.users(id) on delete set null default auth.uid(),
  solicitado_por_nombre text,
  total integer not null default 0,
  estado text not null default 'procesando',
  creado_en timestamptz not null default now(),
  completado_en timestamptz
);

create table if not exists public.comandos_remotos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references public.comandos_lotes(id) on delete set null,
  notebook_id text not null references public.notebooks(id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  motivo text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviado','recibido','ejecutado','fallido','expirado','cancelado')),
  prioridad smallint not null default 5,
  solicitado_por uuid references auth.users(id) on delete set null default auth.uid(),
  solicitado_por_nombre text,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '15 minutes'),
  enviado_en timestamptz,
  recibido_en timestamptz,
  ejecutado_en timestamptz,
  resultado_detalle text,
  intentos integer not null default 0
);

create index if not exists idx_comandos_pendientes on public.comandos_remotos(notebook_id, estado, creado_en);

alter table if exists public.solicitudes_override add column if not exists motivo text;
alter table if exists public.solicitudes_override add column if not exists duracion_minutos integer;
alter table if exists public.solicitudes_override add column if not exists lote_id uuid references public.comandos_lotes(id) on delete set null;
alter table if exists public.solicitudes_override add column if not exists comando_id uuid references public.comandos_remotos(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notificaciones
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  mensaje text,
  severidad text not null default 'informativa',
  destinatario_user_id uuid references auth.users(id) on delete cascade,
  leida boolean not null default false,
  incidencia_id uuid references public.incidencias(id) on delete set null,
  notebook_id text,
  creada_en timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones y triggers de auditoría
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_admin_profiles_touch on public.admin_profiles;
create trigger trg_admin_profiles_touch before update on public.admin_profiles
for each row execute function public.touch_actualizado_en();

drop trigger if exists trg_incidencias_touch on public.incidencias;
create trigger trg_incidencias_touch before update on public.incidencias
for each row execute function public.touch_actualizado_en();

create or replace function public.registrar_evento_tabla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registro jsonb;
  anterior jsonb;
  clave text;
  actor text;
begin
  registro := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  anterior := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  clave := coalesce(registro->>'id', registro->>'rut', registro->>'notebook_id', '');
  actor := public.nombre_admin_actual();

  insert into public.eventos_sistema (
    categoria, tipo_evento, severidad, resultado, descripcion,
    actor_user_id, actor_nombre, notebook_id, rut_usuario, origen, datos
  ) values (
    'administracion', lower(tg_table_name || '_' || tg_op),
    case when tg_op = 'DELETE' then 'alta' else 'informativa' end,
    lower(tg_op),
    tg_op || ' en ' || tg_table_name || case when clave <> '' then ' (' || clave || ')' else '' end,
    auth.uid(), actor,
    coalesce(registro->>'notebook_id', case when tg_table_name = 'notebooks' then registro->>'id' else null end),
    registro->>'rut',
    'database_trigger',
    jsonb_build_object('tabla', tg_table_name, 'nuevo', registro, 'anterior', anterior)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.registrar_evento_acceso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.eventos_sistema (
      fecha_hora, categoria, tipo_evento, severidad, resultado, descripcion,
      rut_usuario, nombre_usuario, notebook_id, sala, curso, origen, datos
    ) values (
      coalesce(new.timestamp_inicio, now()), 'acceso', coalesce(new.tipo_evento, 'intento_acceso'),
      case when new.resultado = 'fallido' then 'media' else 'informativa' end,
      coalesce(new.resultado, 'registrado'),
      'Intento de acceso ' || coalesce(new.resultado, 'registrado'),
      new.rut, new.nombre, new.notebook_id, new.sala, new.curso, 'kiosk', to_jsonb(new)
    );
  elsif tg_op = 'UPDATE' and old.timestamp_fin is distinct from new.timestamp_fin then
    insert into public.eventos_sistema (
      fecha_hora, categoria, tipo_evento, severidad, resultado, descripcion,
      rut_usuario, nombre_usuario, notebook_id, sala, curso, origen, datos
    ) values (
      coalesce(new.timestamp_fin, now()), 'sesion', 'sesion_finalizada', 'informativa', 'cerrada',
      'Sesión finalizada', new.rut, new.nombre, new.notebook_id, new.sala, new.curso,
      'database_trigger', jsonb_build_object('acceso_id', new.id, 'inicio', new.timestamp_inicio, 'fin', new.timestamp_fin)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accesos_evento on public.accesos;
create trigger trg_accesos_evento after insert or update on public.accesos
for each row execute function public.registrar_evento_acceso();

-- Auditoría de tablas administrativas existentes
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estudiantes','docentes','notebooks','solicitudes_override','examenes_kiosk']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('drop trigger if exists trg_%I_auditoria on public.%I', t, t);
      EXECUTE format('create trigger trg_%I_auditoria after insert or update or delete on public.%I for each row execute function public.registrar_evento_tabla()', t, t);
    END IF;
  END LOOP;
END $$;

create or replace function public.alerta_a_incidencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inc_id uuid;
  sev text;
begin
  if tg_op = 'INSERT' then
    sev := case new.tipo
      when 'sospechoso' then 'alta'
      when 'exceso_intentos' then 'alta'
      when 'duplicado' then 'media'
      else 'media'
    end;
    insert into public.incidencias(source_alert_id, titulo, descripcion, tipo, severidad, estado, notebook_id, rut, creada_en, datos)
    values(new.id::text, 'Alerta: ' || replace(new.tipo, '_', ' '), new.descripcion, new.tipo, sev,
           case when new.resuelta then 'resuelta' else 'nueva' end,
           new.notebook_id, new.rut, coalesce(new.timestamp, now()), to_jsonb(new))
    on conflict (source_alert_id) do update set
      descripcion = excluded.descripcion,
      estado = excluded.estado,
      actualizada_en = now()
    returning id into inc_id;

    insert into public.eventos_sistema(
      fecha_hora, categoria, tipo_evento, severidad, resultado, descripcion,
      rut_usuario, notebook_id, incidencia_id, origen, datos
    ) values (
      coalesce(new.timestamp, now()), 'seguridad', new.tipo, sev,
      case when new.resuelta then 'resuelta' else 'detectada' end,
      new.descripcion, new.rut, new.notebook_id, inc_id, 'kiosk', to_jsonb(new)
    );
  elsif tg_op = 'UPDATE' and old.resuelta is distinct from new.resuelta then
    update public.incidencias set
      estado = case when new.resuelta then 'resuelta' else 'nueva' end,
      resuelta_en = case when new.resuelta then now() else null end,
      resuelta_por = case when new.resuelta then auth.uid() else null end,
      resuelta_por_nombre = case when new.resuelta then public.nombre_admin_actual() else null end,
      actualizada_en = now()
    where source_alert_id = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alerta_incidencia on public.alertas;
create trigger trg_alerta_incidencia after insert or update on public.alertas
for each row execute function public.alerta_a_incidencia();

-- Backfill de alertas históricas
insert into public.incidencias(source_alert_id, titulo, descripcion, tipo, severidad, estado, notebook_id, rut, creada_en, datos)
select a.id::text, 'Alerta: ' || replace(a.tipo, '_', ' '), a.descripcion, a.tipo,
       case when a.tipo in ('sospechoso','exceso_intentos') then 'alta' else 'media' end,
       case when a.resuelta then 'resuelta' else 'nueva' end,
       a.notebook_id, a.rut, a.timestamp, to_jsonb(a)
from public.alertas a
on conflict (source_alert_id) do nothing;

-- Marcar dispositivos offline sin eliminar su última información
create or replace function public.marcar_dispositivos_offline(minutos integer default 5)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare afectados integer;
begin
  update public.dispositivos_estado
  set online = false, actualizado_en = now()
  where online = true and ultima_senal < now() - make_interval(mins => minutos);
  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. El agente usa SERVICE_ROLE desde las rutas servidoras.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_profiles','eventos_sistema','incidencias','incidencia_eventos',
    'dispositivos_estado','dispositivos_heartbeats','comandos_lotes',
    'comandos_remotos','notificaciones'
  ] LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('drop policy if exists admin_select on public.%I', t);
    EXECUTE format('drop policy if exists admin_insert on public.%I', t);
    EXECUTE format('drop policy if exists admin_update on public.%I', t);
    EXECUTE format('drop policy if exists admin_delete on public.%I', t);
    EXECUTE format('create policy admin_select on public.%I for select to authenticated using (public.es_admin())', t);
    EXECUTE format('create policy admin_insert on public.%I for insert to authenticated with check (public.es_admin())', t);
    EXECUTE format('create policy admin_update on public.%I for update to authenticated using (public.es_admin()) with check (public.es_admin())', t);
    EXECUTE format('create policy admin_delete on public.%I for delete to authenticated using (public.es_admin())', t);
  END LOOP;
END $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.admin_profiles to authenticated;
grant select, insert, update, delete on public.eventos_sistema to authenticated;
grant select, insert, update, delete on public.incidencias to authenticated;
grant select, insert, update, delete on public.incidencia_eventos to authenticated;
grant select, insert, update, delete on public.dispositivos_estado to authenticated;
grant select, insert, update, delete on public.dispositivos_heartbeats to authenticated;
grant select, insert, update, delete on public.comandos_lotes to authenticated;
grant select, insert, update, delete on public.comandos_remotos to authenticated;
grant select, insert, update, delete on public.notificaciones to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.marcar_dispositivos_offline(integer) to authenticated;

-- Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos_sistema; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dispositivos_estado; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comandos_remotos; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
