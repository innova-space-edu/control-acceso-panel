-- Hotfix posterior a 202607290001_control_central.sql
-- Restringe escrituras administrativas y corrige instalaciones ya migradas.

create or replace function public.es_admin_escritura()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.activo = true
      and p.rol <> 'solo_lectura'
  );
$$;

create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.activo = true
      and p.rol = 'superadmin'
  );
$$;

alter table public.admin_profiles enable row level security;
drop policy if exists admin_select on public.admin_profiles;
drop policy if exists admin_insert on public.admin_profiles;
drop policy if exists admin_update on public.admin_profiles;
drop policy if exists admin_delete on public.admin_profiles;
create policy admin_select on public.admin_profiles
  for select to authenticated using (public.es_admin());
create policy admin_insert on public.admin_profiles
  for insert to authenticated with check (public.es_superadmin());
create policy admin_update on public.admin_profiles
  for update to authenticated using (public.es_superadmin()) with check (public.es_superadmin());
create policy admin_delete on public.admin_profiles
  for delete to authenticated using (public.es_superadmin());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eventos_sistema','incidencias','incidencia_eventos',
    'dispositivos_estado','dispositivos_heartbeats','comandos_lotes',
    'comandos_remotos','notificaciones'
  ] LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('drop policy if exists admin_select on public.%I', t);
    EXECUTE format('drop policy if exists admin_insert on public.%I', t);
    EXECUTE format('drop policy if exists admin_update on public.%I', t);
    EXECUTE format('drop policy if exists admin_delete on public.%I', t);
    EXECUTE format('create policy admin_select on public.%I for select to authenticated using (public.es_admin())', t);
    EXECUTE format('create policy admin_insert on public.%I for insert to authenticated with check (public.es_admin_escritura())', t);
    EXECUTE format('create policy admin_update on public.%I for update to authenticated using (public.es_admin_escritura()) with check (public.es_admin_escritura())', t);
    EXECUTE format('create policy admin_delete on public.%I for delete to authenticated using (public.es_admin_escritura())', t);
  END LOOP;
END $$;

grant execute on function public.es_admin_escritura() to authenticated;
grant execute on function public.es_superadmin() to authenticated;
