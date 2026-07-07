-- =====================================================================
-- Migration: 20260707000001_extensions_and_helpers.sql
-- Description: Required extensions and helper functions for the
--              Videoconferencing Course Platform.
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "uuid-ossp";  -- uuid_generate_v4()
create extension if not exists "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------
-- updated_at trigger function – reusable across all tables
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- audit trigger function – write changes to public.audit_logs
-- ---------------------------------------------------------------------
create or replace function public.fn_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_action text;
    v_row    jsonb;
begin
    if (tg_op = 'INSERT') then
        v_action := 'insert';
        v_row    := to_jsonb(new);
    elsif (tg_op = 'UPDATE') then
        v_action := 'update';
        v_row    := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    elsif (tg_op = 'DELETE') then
        v_action := 'delete';
        v_row    := to_jsonb(old);
    end if;

    insert into public.audit_logs (table_name, row_id, action, actor_id, changes)
    values (tg_table_name, coalesce(new.id, old.id), v_action, auth.uid(), v_row);

    return coalesce(new, old);
end;
$$;

comment on function public.fn_audit_changes() is
    'Generic audit trigger. Writes a row to public.audit_logs for every INSERT/UPDATE/DELETE.';
