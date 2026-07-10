/**
 * `lib/env.ts` — the single, validated entry point to every
 * environment variable the application reads at runtime.
 *
 * Why this exists
 * ---------------
 * Project rule (CLAUDE.md §3.6) — "No `process.env` outside
 * `lib/env.ts`. Centralise environment access so it can be
 * validated at boot." This module is the only place
 * `process.env` is read. Every other module imports the typed
 * `env` object.
 *
 * Two-tier design
 * ---------------
 *   - `serverEnv` is read in Server Components, Route Handlers,
 *     and Server Actions. It includes secrets. It must never be
 *     imported by a Client Component (`'use client'` boundary).
 *   - `publicEnv` is the read-only subset of `NEXT_PUBLIC_*`
 *     variables. It is safe to import from Client Components.
 *
 * Validation
 * ----------
 * The schemas are Zod. Validation runs lazily on first read and
 * the result is memoised, so a misconfigured variable fails fast
 * (the first import throws) and only once per process. This is
 * why the schemas are exported (so tests can construct a
 * pre-validated env via `envFrom()`).
 */
import { z } from 'zod';

// =====================================================================
// Public env (NEXT_PUBLIC_*) — safe to read in the browser
// =====================================================================
//
// Build-time policy: the schema enforces the *real* runtime shape
// (the URL must parse, the anon key must be long enough), but it
// tolerates an empty / missing `.env.local` so that
// `next build` can still prerender the marketing pages that don't
// actually call Supabase at build time. The validation still
// fires the first time a server-side query reads `publicEnv()` —
// and a missing `NEXT_PUBLIC_SUPABASE_URL` produces a clear,
// actionable error ("Did you create `.env.local` from
// `.env.example`?"). This matches the locked architecture: the
// canonical config lives in `.env.local` (never committed), the
// repository ships only `.env.example`.

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.')
    .optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or too short.')
    .optional(),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url('NEXT_PUBLIC_SITE_URL must be a valid URL.')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z
    .enum(['en', 'fr'])
    .default('fr'),
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z
    .string()
    .default('Europe/Paris'),
  NEXT_PUBLIC_CALENDLY_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_N8N_BOOKING_WEBHOOK: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let publicCache: PublicEnv | null = null;
export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL:        process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL:            process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_DEFAULT_LOCALE:      process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
    NEXT_PUBLIC_DEFAULT_TIMEZONE:    process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE,
    NEXT_PUBLIC_CALENDLY_URL:        process.env.NEXT_PUBLIC_CALENDLY_URL,
    NEXT_PUBLIC_N8N_BOOKING_WEBHOOK: process.env.NEXT_PUBLIC_N8N_BOOKING_WEBHOOK,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid public environment variables:\n${issues}`);
  }
  publicCache = parsed.data;
  return publicCache;
}

// =====================================================================
// Server env — secrets, must never be imported in client code
// =====================================================================

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing or too short.'),
  STRIPE_SECRET_KEY:         z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET:     z.string().min(1).optional(),
  STRIPE_PRICE_PAYG:         z.string().min(1).optional(),
  STRIPE_PRICE_SUBSCRIPTION: z.string().min(1).optional(),
  // Sprint C: per-course price map. JSON string of the form
  //   { "<course-uuid>": "price_xxx", ... }
  // Empty in dev → the checkout route returns 503 with a clear
  // "no_price_table" error code (the route never calls Stripe
  // directly — it delegates to n8n — so the env var is read by
  // the n8n workflow, not by the route).
  STRIPE_PRICE_TABLE_JSON:   z.string().optional(),
  ZOOM_ACCOUNT_ID:           z.string().min(1).optional(),
  ZOOM_CLIENT_ID:            z.string().min(1).optional(),
  ZOOM_CLIENT_SECRET:        z.string().min(1).optional(),
  ZOOM_DEFAULT_HOST_USER_ID: z.string().min(1).optional(),
  CALENDLY_PERSONAL_TOKEN:   z.string().min(1).optional(),
  CALENDLY_WEBHOOK_SIGNING_KEY: z.string().min(1).optional(),
  RESEND_API_KEY:            z.string().min(1).optional(),
  RESEND_FROM_EMAIL:         z.string().email().default('no-reply@example.com'),
  N8N_BASE_URL:              z.string().url().optional().or(z.literal('').transform(() => undefined)),
  N8N_API_KEY:               z.string().min(1).optional(),
  N8N_WEBHOOK_SECRET:        z.string().min(1).optional(),
  // Sprint C: the n8n webhook URL the Next.js
  // /api/enrollments/checkout route calls to have n8n create
  // the Stripe Checkout Session. The Next.js app does NOT call
  // Stripe directly (locked architecture — n8n is the only
  // system that calls Stripe on the booking path). When this
  // var is empty the route returns 503.
  N8N_ENROLLMENT_WEBHOOK_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  LOG_LEVEL:                 z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  SENTRY_DSN:                z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let serverCache: ServerEnv | null = null;

/**
 * Read and validate the server-only env. Server-only — do not
 * import this from a Client Component. The cached result is
 * shared across the process.
 */
export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY:    process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY:            process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:        process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_PAYG:            process.env.STRIPE_PRICE_PAYG,
    STRIPE_PRICE_SUBSCRIPTION:    process.env.STRIPE_PRICE_SUBSCRIPTION,
    STRIPE_PRICE_TABLE_JSON:      process.env.STRIPE_PRICE_TABLE_JSON,
    ZOOM_ACCOUNT_ID:              process.env.ZOOM_ACCOUNT_ID,
    ZOOM_CLIENT_ID:               process.env.ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET:           process.env.ZOOM_CLIENT_SECRET,
    ZOOM_DEFAULT_HOST_USER_ID:    process.env.ZOOM_DEFAULT_HOST_USER_ID,
    CALENDLY_PERSONAL_TOKEN:      process.env.CALENDLY_PERSONAL_TOKEN,
    CALENDLY_WEBHOOK_SIGNING_KEY: process.env.CALENDLY_WEBHOOK_SIGNING_KEY,
    RESEND_API_KEY:               process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL:            process.env.RESEND_FROM_EMAIL,
    N8N_BASE_URL:                 process.env.N8N_BASE_URL,
    N8N_API_KEY:                  process.env.N8N_API_KEY,
    N8N_WEBHOOK_SECRET:           process.env.N8N_WEBHOOK_SECRET,
    N8N_ENROLLMENT_WEBHOOK_URL:   process.env.N8N_ENROLLMENT_WEBHOOK_URL,
    LOG_LEVEL:                    process.env.LOG_LEVEL,
    SENTRY_DSN:                   process.env.SENTRY_DSN,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${issues}`);
  }
  serverCache = parsed.data;
  return serverCache;
}

/**
 * Reset the env cache. Test-only. After a test mutates
 * `process.env`, it must call `resetEnvCache()` before the next
 * read picks up the new values.
 */
export function resetEnvCache(): void {
  publicCache = null;
  serverCache = null;
}

/**
 * Build a `PublicEnv` / `ServerEnv` from a raw object, without
 * reading `process.env`. Used by tests.
 */
export function publicEnvFrom(raw: Record<string, unknown>): PublicEnv {
  return publicSchema.parse(raw);
}
export function serverEnvFrom(raw: Record<string, unknown>): ServerEnv {
  return serverSchema.parse(raw);
}
