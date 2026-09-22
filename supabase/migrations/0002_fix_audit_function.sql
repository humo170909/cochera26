-- =============================================================================
-- PARKING ADMIN - Migración 0002
-- Corrige fn_audit_row_change(): asumía columnas "id"/"key" por acceso
-- estático (new.id / new.key), lo que revienta con:
--   ERROR: 42703: record "new" has no field "key"
-- en cuanto la tabla auditada no tiene esa columna exacta (tariffs y
-- profiles tienen "id" pero no "key"; system_settings tiene "key" pero no
-- "id"). Ejecutar este archivo completo en el SQL Editor de Supabase sobre
-- un proyecto que ya corrió 0001_init.sql. Es seguro de re-ejecutar
-- (CREATE OR REPLACE, sin DROP).
-- =============================================================================

create or replace function public.fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk_column text;
  v_row jsonb;
  v_before jsonb;
  v_after jsonb;
  v_entity_id text;
begin
  -- Primary key real de la tabla disparadora, la que sea (id, key, u otra).
  select a.attname
    into v_pk_column
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey::int2[])
  where i.indrelid = TG_RELID
    and i.indisprimary
  order by array_position(i.indkey::int2[], a.attnum)
  limit 1;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(old);
    v_before := v_row;
    v_after := null;
  elsif TG_OP = 'INSERT' then
    v_row := to_jsonb(new);
    v_before := null;
    v_after := v_row;
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_row := v_after;
  end if;

  -- ->> sobre jsonb nunca falla si la columna no existe: devuelve NULL.
  if v_pk_column is not null then
    v_entity_id := v_row ->> v_pk_column;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    TG_OP || '_' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
exception when others then
  -- Una falla de auditoría nunca debe abortar la operación real que la
  -- disparó (cambio de tarifa, de usuario, etc.). Se deja constancia como
  -- warning en los logs de Postgres y se permite continuar.
  raise warning 'fn_audit_row_change: no se pudo auditar % en % (%): %',
    TG_OP, TG_TABLE_NAME, v_entity_id, SQLERRM;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
