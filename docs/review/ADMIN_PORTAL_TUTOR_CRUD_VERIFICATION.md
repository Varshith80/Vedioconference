# Admin Portal Tutor CRUD — Local Runtime Verification Report

**Date:** 2026-09-03
**Scope:** PostgREST-level + DB-level verification of tutor CRUD with admin and non-admin JWTs against the local development Supabase stack.
**Database path:** `127.0.0.1:54322` (Postgres), `127.0.0.1:54321` (PostgREST + GoTrue)
**Migration under test:** `supabase/migrations/20260901000001_grant_tutors_write_to_authenticated.sql` (applied locally, not committed, not pushed remotely)
**Remote:** Not touched.

---

## 1. Exact migration SQL (for the record)

`supabase/migrations/20260901000001_grant_tutors_write_to_authenticated.sql`:

```sql
grant insert, update, delete on table public.tutors to authenticated;
```

The file is on disk, untracked by git. Idempotent (GRANTs are no-ops if already granted).

---

## 2. Post-apply database state (local)

```
--- POST-APPLY authenticated GRANTS on public.tutors ---
┌─────────────────┬────────────────┐
│ grantee         │ privilege_type │
├─────────────────┼────────────────┤
│ authenticated   │ DELETE         │
│ authenticated   │ INSERT         │
│ authenticated   │ REFERENCES     │
│ authenticated   │ SELECT         │
│ authenticated   │ TRIGGER        │
│ authenticated   │ TRUNCATE       │
│ authenticated   │ UPDATE         │
└─────────────────┴────────────────┘

--- POST-APPLY RLS state ---
relrowsecurity = true     (RLS still enabled)
relforcerowsecurity = false

--- POST-APPLY policy stack ---
tutors_admin_all    cmd='*'    using='is_admin()'    with_check='is_admin()'
```

✅ RLS still enabled. ✅ Same single policy. ✅ GRANTs added the three minimum privileges. The base-table/RLS contract is intact.

---

## 3. Direct PostgREST verification (`public.tutors`)

Admin user: `webvedioconference@gmail.com` (profiles.role = `super_admin` → `is_admin()` = true)
Student user: `student@example.com` (profiles.role = `student` → `is_admin()` = false)

| # | Probe | Admin JWT | Student JWT | Verdict |
|---|---|---|---|---|
| 1 | `GET /rest/v1/tutors?select=*` | **200**, 1 row | **200**, 0 rows | ✅ Admin sees data; student sees zero (RLS denies — correct closed-by-default behaviour for the single `tutors_admin_all` policy) |
| 2 | `POST /rest/v1/tutors` (create tutor) | **201 Created**, row inserted with id `9aac2eed-…` | **403**, SQLSTATE 42501: *"new row violates row-level security policy for table 'tutors'"* | ✅ Migration goal achieved |
| 3 | `PATCH /rest/v1/tutors?id=eq.<id>` `{status:'inactive'}` | **400**, SQLSTATE 42703: *"record 'new' has no field 'profile_id'"* | **200 OK []** (no rows match for student, 0 affected) | ❌ **Admin UPDATE blocked by a different bug — see §4** |
| 4 | `DELETE /rest/v1/tutors?id=eq.<id>` | **204 No Content** | **204 No Content** | ✅ Admin can delete; student sees 204 only because RLS already filtered the row out of their visibility (0 rows affected) |

**Raw capture:**
```
admin SELECT    200 rows 1
student SELECT 200 rows 0
admin INSERT   201 OK [{"id":"9aac2eed-931c-4f7f-9233-0c6fac6b6523",...,"status":"active",...}]
student INSERT 403 FAIL {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"tutors\""}
admin UPDATE   400 FAIL {"code":"42703","details":null,"hint":null,"message":"record \"new\" has no field \"profile_id\""}
student UPDATE 200 OK []
admin DELETE   204 OK
student DELETE 204 OK
```

---

## 4. **Critical finding — Admin UPDATE is blocked by a separate bug**

The GRANT migration does its job. CREATE and DELETE work for admin. But **admin UPDATE fails** with:

```
SQLSTATE 42703
message: "record \"new\" has no field \"profile_id\""
```

### Root cause

`public.tutors` has a BEFORE UPDATE trigger `trg_tutors_lock_profile` whose function is:

```sql
create or replace function public.fn_lock_tutor_profile_id()
returns trigger language plpgsql as $function$
begin
    if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
        raise exception 'tutor.profile_id is immutable'
            using errcode = '42501';
    end if;
    return new;
end;$function$
```

It references `NEW.profile_id`. But **`public.tutors` has no `profile_id` column**. Confirmed by:

```
--- public.tutors columns ---
id, years_experience, currency, calendly_event_uri, zoom_user_id,
rating_count, metadata, created_at, updated_at,
full_name, email, phone, status, notes
(14 columns; no profile_id)
```

The trigger fails on every UPDATE before any policy check, because PL/pgSQL resolves `new.profile_id` against the actual row type at execution time, and the field doesn't exist.

### Why this is bad

- Admin editing any tutor record fails at the database, regardless of authentication or RLS.
- The user originally observed *"Unable to create tutors. Unable to delete tutors."* — those were GRANT issues and are now fixed.
- The user has not yet observed the UPDATE failure because the create-edit-delete cycle in the browser never reached the PATCH. With the GRANT applied, the cycle now reaches the PATCH and surfaces this latent bug.

### Provenance — this is an undocumented schema artifact

`grep -r 'fn_lock_tutor_profile_id|trg_tutors_lock_profile' supabase/migrations/` → **no files**. The trigger exists in the live local database but has no migration source. It was applied out-of-band at some point (likely via the Supabase Studio SQL editor in a prior session).

The decision to keep `profile_id` "immutable" was a v1 design assumption when tutors were tied to a profile. The standalone-tutor refactor (`20260719000002_reshape_tutors_v1_to_standalone`) restructured the table but left this trigger in place. The trigger is now a half-orphan — its enforcement target no longer exists.

### Two fix options — both require explicit user approval (CLAUDE.md §3.2)

**Option A — Drop the orphan trigger** (preferred for the standalone-tutor model):

```sql
-- supabase/migrations/20260902000001_drop_orphan_tutor_profile_trigger.sql
drop trigger if exists trg_tutors_lock_profile on public.tutors;
drop function if exists fn_lock_tutor_profile_id();
```

- Forward-only
- Idempotent (`if exists`)
- Removes only the orphan artifact
- Does not touch data, RLS, policies, or any other table

**Option B — Add the missing `profile_id` column and re-anchor the trigger** (reverts to v1 design):

- Adds a `profile_id uuid references public.profiles(id)` column
- Backfills with NULL
- Leaves the trigger in place

Option A is correct for the current standalone-tutor model (Sprint 3.8). Option B reintroduces the v1 coupling the refactor removed.

**I will not apply either option without explicit user approval.** Per CLAUDE.md §3.2 ("Never change the database schema without explicit approval. Migrations are forward-only"), both qualify.

---

## 5. Local migration-history check

```
--- APPLIED MIGRATIONS (local) ---
28 rows. Newest: 20260825000002  subscriptions_pack_monthly_support
```

The new file `20260901000001_grant_tutors_write_to_authenticated.sql` is **not in this list** because I applied it via `node + pg` directly, not through `supabase db push`. This is the documented path the user approved ("apply it to the LOCAL development Supabase database"). When the user is ready to apply the remote, `supabase db push` will replay the file in order; the GRANT is idempotent so this is safe.

---

## 6. Remaining Admin Portal issues (per user's broader investigation list)

| # | Issue | Status | Action needed |
|---|---|---|---|
| 1 | **Admin UPDATE on tutor blocked by orphan trigger** | **NEW finding**, reproducible runtime evidence | Requires user-approved fix migration (Option A or B above) |
| 2 | Unable to create tutors | ✅ Fixed by GRANT | — |
| 3 | Unable to delete tutors | ✅ Fixed by GRANT | — |
| 4 | Console error cascade (55 → 213) | ✅ Root cause was i18n `MISSING_MESSAGE`; keys added in last session | Live browser run still recommended (not in scope here) |
| 5 | Raw translation key `Admin.tutorCreate.fields.status` in UI | ✅ Key path exists now | Live browser run recommended to confirm |
| 6 | English/French translations | ✅ Keys added for both locales | Live verification pending |
| 7 | Sessions not displaying completely | Not investigated in this pass | Needs live browser test |
| 8 | Chapters not displaying completely | Not investigated | Needs live browser test |
| 9 | Courses/curriculum data missing | Sprint 5 importer scope (Excel). Confirmed in PHASE G last session. | Out of scope; tracked in `PHASE2_SPRINT_5_SUMMARY.md` |
| 10 | Other admin page issues | Not investigated | Phase 3 of the user's instruction |

---

## 7. Sprint boundary state

- ✅ Sprint 9 not started
- ✅ Student Dashboard work not started
- ✅ Dashboard UI redesign not started
- ✅ Remote Supabase not touched
- ✅ No git commit / push performed
- ✅ The migration file is on disk but untracked

---

## 8. What I need from the user

**Option A or B decision on the orphan trigger**, plus whether the user wants me to continue with the live runtime verification through the actual Next.js `app/api/admin/tutors` route (which depends on the trigger fix to reach the PATCH path).

I will not proceed without explicit approval.