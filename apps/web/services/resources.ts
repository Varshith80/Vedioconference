import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import {
  ApiError,
  NotFound,
  describeError,
  notNullViolationToBadRequest,
  rlsErrorToForbidden,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  AdminResourceCreateInput,
  AdminResourceEditInput,
  ResourceVisibility,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 8 — R-1 + R-2 Resources delivery surface (service layer).
//
// Architecture
// ------------
// - Reads use the RLS-respecting SSR Supabase client
//   (`createSupabaseServerClientUntyped`). The DB enforces
//   visibility:
//     * `public` resources → everyone (incl. anon)
//     * `enrolled` → student with a session_grant for a session
//       in the resource's course
//     * `private` → uploader only
//     * admins → everything (via `public.is_admin()`)
//   This is the `resources_select_visible` RLS policy
//   (20260715000000_drop_v1_back_compat_tables.sql §c.1).
// - Writes are admin-only via `requireAdminRoute()` in the route
//   layer. The DB-level `resources_write_admin_or_tutor` policy
//   lets an admin OR the uploader write — we always set
//   `uploaded_by = auth.uid()` server-side so the policy fires
//   consistently.
// - Read helpers are `cache()`-wrapped (matches
//   services/notifications.ts).
// - Write helpers throw typed ApiErrors (matches
//   services/admin/tutors.ts).
// - Type-safety note: the untyped Supabase factory returns
//   `never`-typed chains for tables not in the hand-maintained
//   `Database` type. We use `as never` casts at the boundary
//   (CLAUDE §3.9) and re-cast rows at the consumer.
// =====================================================================

type SupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClientUntyped>
>;

/** Row shape returned by the `resources` select. */
interface ResourceRow {
  id: string;
  course_id: string | null;
  created_at: string;
  description: string | null;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  title: string;
  tutor_id: string | null;
  updated_at: string;
  uploaded_by: string | null;
  visibility: string;
}

const RESOURCE_SELECT = [
  'id',
  'course_id',
  'created_at',
  'description',
  'file_name',
  'file_path',
  'mime_type',
  'size_bytes',
  'title',
  'tutor_id',
  'updated_at',
  'uploaded_by',
  'visibility',
].join(', ');

const RESOURCE_VISIBILITIES = new Set<ResourceVisibility>([
  'public',
  'enrolled',
  'private',
]);

function normalizeVisibility(raw: string): ResourceVisibility {
  return RESOURCE_VISIBILITIES.has(raw as ResourceVisibility)
    ? (raw as ResourceVisibility)
    : 'enrolled';
}

export interface Resource {
  id: string;
  courseId: string | null;
  createdAt: string;
  description: string | null;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  title: string;
  tutorId: string | null;
  updatedAt: string;
  uploadedBy: string | null;
  visibility: ResourceVisibility;
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    courseId: row.course_id ?? null,
    createdAt: row.created_at,
    description: row.description ?? null,
    fileName: row.file_name,
    filePath: row.file_path,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    title: row.title,
    tutorId: row.tutor_id ?? null,
    updatedAt: row.updated_at,
    uploadedBy: row.uploaded_by ?? null,
    visibility: normalizeVisibility(row.visibility),
  };
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

/**
 * List the resources visible to the signed-in user. The RLS
 * policy `resources_select_visible` filters out anything the
 * user is not allowed to see, so we just return what the DB
 * gives us. Newest first.
 *
 * Student dashboard uses this directly. Admins also get the
 * full list (the policy lets admins through unconditionally).
 */
export const listResourcesForCurrentUser = cache(
  async (): Promise<ReadonlyArray<Resource>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('resources')
        .select(RESOURCE_SELECT)
        .order('created_at', { ascending: false });
      if (error) {
        logger.warn('listResourcesForCurrentUser failed', {
          error: describeError(error),
        });
        return [];
      }
      return ((data ?? []) as unknown as ResourceRow[]).map(rowToResource);
    } catch (e) {
      logger.warn('listResourcesForCurrentUser threw', {
        error: describeError(e),
      });
      return [];
    }
  },
);

/**
 * Admin: list every resource, newest first. Uses the SSR client
 * with the admin role enforced by `requireAdminRoute()` in the
 * route handler.
 *
 * Throws on read failure so the calling page (admin/resources)
 * can build an `AdminFetchResult` envelope through
 * `safeAdminFetch()`. The student-side `listResourcesForCurrentUser`
 * below keeps the original swallow-on-error behaviour because
 * the student dashboard renders errors via the global error
 * boundary rather than a destructive card.
 */
export const listAllResources = cache(
  async (): Promise<ReadonlyArray<Resource>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('resources')
      .select(RESOURCE_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('listAllResources failed', {
        error: describeError(error),
      });
      throw error;
    }
    return ((data ?? []) as unknown as ResourceRow[]).map(rowToResource);
  },
);

/** Single resource by id, with RLS filtering applied. */
export const getResourceById = cache(
  async (id: string): Promise<Resource | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('resources')
        .select(RESOURCE_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error('getResourceById failed', { id, error: describeError(error) });
        return null;
      }
      if (!data) return null;
      return rowToResource(data as unknown as ResourceRow);
    } catch (e) {
      logger.error('getResourceById threw', { id, error: describeError(e) });
      return null;
    }
  },
);

// ---------------------------------------------------------------------
// Writes (admin)
// ---------------------------------------------------------------------

/**
 * Create a resource. The route handler must enforce the admin
 * role via `requireAdminRoute()`; this service writes through
 * the same SSR client so the `resources_write_admin_or_tutor`
 * policy approves the INSERT.
 *
 * `uploaded_by` is always set from auth.uid() server-side so
 * the row has a stable uploader reference. Clients cannot
 * override it.
 *
 * Throws:
 *   - `ApiError(403)` on Postgres 42501 (RLS) violation.
 *   - `ApiError(400)` on a 23502 not-null violation (the
 *     remote schema has a required column the v2 form
 *     doesn't supply).
 *   - `ApiError(500)` for unexpected failures.
 */
export async function createResource(
  input: AdminResourceCreateInput,
  supabase?: SupabaseClient,
): Promise<Resource> {
  const client = supabase ?? (await createSupabaseServerClientUntyped());

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new ApiError(401, 'unauthorized', 'Sign in required.');
  }

  const insert = {
    title: input.title,
    description: input.description ?? null,
    file_name: input.file_name,
    file_path: input.file_path,
    mime_type: input.mime_type ?? null,
    size_bytes: input.size_bytes ?? null,
    course_id: input.course_id ?? null,
    tutor_id: input.tutor_id ?? null,
    visibility: input.visibility ?? 'enrolled',
    uploaded_by: user.id,
  };

  try {
    const { data: row, error } = await client
      .from('resources')
      .insert(insert as never)
      .select(RESOURCE_SELECT)
      .single();
    if (error) {
      const notNull = notNullViolationToBadRequest(error);
      if (notNull) throw notNull;
      const rls = rlsErrorToForbidden(error, 'INSERT');
      if (rls) throw rls;
      throw error;
    }
    return rowToResource(row as unknown as ResourceRow);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    logger.error('createResource failed', describeError(e));
    throw new ApiError(
      500,
      'resource_create_failed',
      'Could not create resource row.',
      { reason: describeError(e).message },
    );
  }
}

/**
 * Update a resource by id. All fields optional. The
 * `resources_write_admin_or_tutor` policy lets an admin OR the
 * uploader modify a row.
 *
 * Throws:
 *   - `ApiError(404)` when no row matched.
 *   - `ApiError(403)` on Postgres 42501.
 *   - `ApiError(400)` on a 23502 violation.
 *   - `ApiError(500)` for unexpected failures.
 */
export async function updateResource(
  id: string,
  input: AdminResourceEditInput,
  supabase?: SupabaseClient,
): Promise<Resource> {
  const client = supabase ?? (await createSupabaseServerClientUntyped());

  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update['title'] = input.title;
  if (input.description !== undefined) update['description'] = input.description;
  if (input.file_name !== undefined) update['file_name'] = input.file_name;
  if (input.file_path !== undefined) update['file_path'] = input.file_path;
  if (input.mime_type !== undefined) update['mime_type'] = input.mime_type;
  if (input.size_bytes !== undefined) update['size_bytes'] = input.size_bytes;
  if (input.course_id !== undefined) update['course_id'] = input.course_id;
  if (input.tutor_id !== undefined) update['tutor_id'] = input.tutor_id;
  if (input.visibility !== undefined) update['visibility'] = input.visibility;

  if (Object.keys(update).length === 0) {
    // Nothing to do — return current state if it exists.
    const existing = await getResourceById(id);
    if (!existing) throw NotFound('Resource not found.');
    return existing;
  }

  try {
    const { data: row, error } = await client
      .from('resources')
      .update(update as never)
      .eq('id', id)
      .select(RESOURCE_SELECT)
      .single();
    if (error) {
      // 22P02 = invalid_text_representation — happens when
      // PostgREST can't coerce a value (e.g. a malformed UUID
      // string when the id is missing). Surface as 404 since
      // the row genuinely doesn't match.
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound('Resource not found.');
      }
      const notNull = notNullViolationToBadRequest(error);
      if (notNull) throw notNull;
      const rls = rlsErrorToForbidden(error, 'UPDATE');
      if (rls) throw rls;
      throw error;
    }
    if (!row) throw NotFound('Resource not found.');
    return rowToResource(row as unknown as ResourceRow);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    logger.error('updateResource failed', { id, error: describeError(e) });
    throw new ApiError(
      500,
      'resource_update_failed',
      'Could not update resource row.',
      { reason: describeError(e).message },
    );
  }
}

/**
 * Delete a resource by id. The
 * `resources_write_admin_or_tutor` policy approves the DELETE.
 *
 * Throws:
 *   - `ApiError(404)` when no row was deleted.
 *   - `ApiError(403)` on Postgres 42501.
 *   - `ApiError(500)` for unexpected failures.
 */
export async function deleteResource(
  id: string,
  supabase?: SupabaseClient,
): Promise<{ id: string }> {
  const client = supabase ?? (await createSupabaseServerClientUntyped());

  try {
    const { error, count } = await client
      .from('resources')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) {
      const rls = rlsErrorToForbidden(error, 'DELETE');
      if (rls) throw rls;
      throw error;
    }
    if (count === 0) {
      throw NotFound('Resource not found.');
    }
    return { id };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    logger.error('deleteResource failed', { id, error: describeError(e) });
    throw new ApiError(
      500,
      'resource_delete_failed',
      'Could not delete resource row.',
      { reason: describeError(e).message },
    );
  }
}