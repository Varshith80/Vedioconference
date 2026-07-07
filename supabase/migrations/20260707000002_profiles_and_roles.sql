-- =====================================================================
-- Migration: 20260707000002_profiles_and_roles.sql
-- Description: User profile table, role enum, and helper functions
--              for the current user / role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('student', 'admin', 'super_admin');
    end if;
end $$;

-- ---------------------------------------------------------------------
-- profiles – extends auth.users with public-facing data
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    email           citext unique not null,
    full_name       text,
    avatar_url      text,
    phone           text,
    timezone        text not null default 'Europe/Paris',
    role            public.user_role not null default 'student',
    locale          text not null default 'fr',
    is_active       boolean not null default true,
    last_login_at   timestamptz,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_profiles_role      on public.profiles(role);
create index if not exists idx_profiles_is_active on public.profiles(is_active);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Handle new user signup: create a profile row automatically
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        'student'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helper functions used by RLS policies
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select role in ('admin', 'super_admin') from public.profiles where id = auth.uid()),
        false
    );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select role = 'super_admin' from public.profiles where id = auth.uid()),
        false
    );
$$;

comment on function public.current_user_role() is 'Returns the role of the currently authenticated user.';
comment on function public.is_admin()         is 'Returns true if the current user is an admin or super_admin.';
comment on function public.is_super_admin()  is 'Returns true if the current user is a super_admin.';
