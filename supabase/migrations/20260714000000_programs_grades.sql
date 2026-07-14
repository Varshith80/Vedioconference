-- =====================================================================
-- Migration: 20260714000000_programs_grades.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Introduces the top two layers of the new curriculum hierarchy:
--
--   Academic Program  (e.g. High School, Prep School, BTS ABM)
--     └─ Grade        (OPTIONAL — only High School has them)
--
-- Programs are the top of the new hierarchy. The Excel files
-- `Integrale_cours_visio_130726_EN.xlsx` and
-- `Integrale_cours_visio_130726_translated.xlsx` are organised by
-- sheet name = program. The 5 known programs are seeded at the end
-- of this migration. The Grade table is attached to a program via
-- FK; only the High School program has rows in the Grade table.
--
-- Idempotency
-- -----------
-- Every CREATE / INSERT is guarded with `if not exists` (or
-- `on conflict do nothing` for the seed rows). The migration can
-- be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `programs` — the top of the new curriculum hierarchy
-- ---------------------------------------------------------------------
create table if not exists public.programs (
    id            uuid primary key default gen_random_uuid(),
    slug          text unique not null,
    title         text not null,
    subtitle      text,
    description   text,
    is_published  boolean not null default true,
    sort_order    integer not null default 0,
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_programs_slug         on public.programs(slug);
create index if not exists idx_programs_is_published on public.programs(is_published);
create index if not exists idx_programs_sort_order   on public.programs(sort_order);

drop trigger if exists trg_programs_updated_at on public.programs;
create trigger trg_programs_updated_at
    before update on public.programs
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. `grades` — the optional middle layer (only High School has rows)
-- ---------------------------------------------------------------------
create table if not exists public.grades (
    id            uuid primary key default gen_random_uuid(),
    program_id    uuid not null references public.programs(id) on delete cascade,
    slug          text not null,
    title         text not null,
    sort_order    integer not null default 0,
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (program_id, slug)
);

create index if not exists idx_grades_program_id   on public.grades(program_id);
create index if not exists idx_grades_sort_order   on public.grades(sort_order);

drop trigger if exists trg_grades_updated_at on public.grades;
create trigger trg_grades_updated_at
    before update on public.grades
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Audit triggers on the new tables
-- ---------------------------------------------------------------------
drop trigger if exists trg_programs_audit on public.programs;
create trigger trg_programs_audit
    after insert or update or delete on public.programs
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_grades_audit on public.grades;
create trigger trg_grades_audit
    after insert or update or delete on public.grades
    for each row execute function public.fn_audit_changes();

-- ---------------------------------------------------------------------
-- 4. Row-Level Security — published-only reads, admin writes
-- ---------------------------------------------------------------------
alter table public.programs enable row level security;
alter table public.grades   enable row level security;

drop policy if exists programs_select_published_or_admin on public.programs;
create policy programs_select_published_or_admin
    on public.programs for select
    using (
        is_published = true
        or public.is_admin()
    );

drop policy if exists programs_admin_write on public.programs;
create policy programs_admin_write
    on public.programs for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

drop policy if exists grades_select_published_or_admin on public.grades;
create policy grades_select_published_or_admin
    on public.grades for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.programs p
            where p.id = grades.program_id
              and p.is_published = true
        )
    );

drop policy if exists grades_admin_write on public.grades;
create policy grades_admin_write
    on public.grades for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- ---------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------
comment on table public.programs is
    'Top of the curriculum hierarchy. The 5 known programs: High School, Prep School, BTS ABM, BTS Optics, BTS BioALC.';
comment on table public.grades is
    'OPTIONAL middle layer of the curriculum hierarchy. Only the High School program has rows; the others skip this layer.';

-- ---------------------------------------------------------------------
-- 6. Seed the 5 known programs + 2 High School grades
-- ---------------------------------------------------------------------
-- The slugs are the canonical identifiers used by the marketing
-- route /levels/[levelSlug] — they match the existing
-- `courses.level_group` enum values (`high_school`,
-- `preparatory`) plus three new ones for the BTS programs.

insert into public.programs (slug, title, subtitle, sort_order) values
    ('high_school', 'High School',       'Lycée — Seconde, Première, Terminale', 10),
    ('preparatory', 'Prep School',       'Classes préparatoires aux grandes écoles', 20),
    ('bts_abm',     'BTS ABM',           'Analyses de Biologie Médicale',         30),
    ('bts_optics',  'BTS Optics',        'Opticien-Lunetier',                     40),
    ('bts_bioalc',  'BTS BioALC',        'Bio-analyses et Contrôles',             50)
on conflict (slug) do nothing;

-- Only the High School program has grades.
insert into public.grades (program_id, slug, title, sort_order)
select p.id, g.slug, g.title, g.sort_order
from public.programs p
cross join (values
    ('grade_11', 'Grade 11 (Première)', 10),
    ('grade_12', 'Grade 12 (Terminale)', 20)
) as g(slug, title, sort_order)
where p.slug = 'high_school'
on conflict (program_id, slug) do nothing;

-- ---------------------------------------------------------------------
-- 7. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
