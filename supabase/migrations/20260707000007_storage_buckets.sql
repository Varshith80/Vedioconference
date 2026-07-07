-- =====================================================================
-- Migration: 20260707000007_storage_buckets.sql
-- Description: Storage buckets and their policies.
--
--  * avatars  – public read, owner write
--  * resources – private read (signed URLs), admin / tutor write
--  * course-covers – public read, admin write
-- =====================================================================

insert into storage.buckets (id, name, public)
values
    ('avatars',       'avatars',       true),
    ('resources',     'resources',     false),
    ('course-covers', 'course-covers', true)
on conflict (id) do nothing;

-- avatars: public read
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
    on storage.objects for select
    using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
    on storage.objects for insert
    with check (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
    on storage.objects for update
    using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

-- course-covers: public read, admin write
drop policy if exists "course_covers_public_read" on storage.objects;
create policy "course_covers_public_read"
    on storage.objects for select
    using (bucket_id = 'course-covers');

drop policy if exists "course_covers_admin_write" on storage.objects;
create policy "course_covers_admin_write"
    on storage.objects for all
    using (bucket_id = 'course-covers' and public.is_admin())
    with check (bucket_id = 'course-covers' and public.is_admin());

-- resources: only admin or the uploader can read/write
drop policy if exists "resources_owner_or_admin_read" on storage.objects;
create policy "resources_owner_or_admin_read"
    on storage.objects for select
    using (
        bucket_id = 'resources'
        and (
            public.is_admin()
            or auth.uid()::text = (storage.foldername(name))[1]
        )
    );

drop policy if exists "resources_owner_or_admin_write" on storage.objects;
create policy "resources_owner_or_admin_write"
    on storage.objects for all
    using (
        bucket_id = 'resources'
        and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
    )
    with check (
        bucket_id = 'resources'
        and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
    );
