/**
 * Auth-domain User type. Mirrors the strong `Profile` type in
 * `types/domain.ts` but stays minimal so the auth abstraction does
 * not depend on the profile / RLS data model. Sprint B2 will
 * reconcile the two via a thin mapper.
 */

export interface User {
  /** Provider-scoped user id (UUID for Supabase, opaque string for the stub). */
  id: string;
  /** E-mail address. Always lowercased on read. */
  email: string;
  /** Display name. Optional at sign-up; required by the profile
   *  completion step. */
  fullName: string | null;
  /** ISO-8601 timestamp of the user creation. */
  createdAt: string;
}
