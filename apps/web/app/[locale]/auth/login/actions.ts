'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { makeAuthSchemas, type LoginInput } from '@/lib/validations/auth';
import { defaultLocale, isLocale, type Locale } from '@/i18n';
import type { Profile } from '@/hooks/use-require-user';

// =====================================================================
// Sprint 3.7 — Server-side post-login redirect.
//
// Why a Server Action and not a client-side role lookup
// ----------------------------------------------------------
// The previous flow had `LoginForm` call `auth.getRole()` against
// the browser Supabase client and decide the destination in the
// component. That lookup races with the cookie write that
// `signInWithPassword` triggers through `@supabase/ssr`:
//   1. the JWT arrives in the response,
//   2. `@supabase/ssr` schedules a `Set-Cookie` on the document,
//   3. React's render path can call `getRole()` in the same tick,
//      and the read either hits a not-yet-valid session or the
//      `profiles_select_own_or_admin` policy's RLS check bounces
//      because the cookie isn't on the request that backs the
//      read.
//
// The form silently swallowed the failure (its `try/catch` set
// `role = null`) and pushed the admin to `/dashboard`. Manual
// sign-out / sign-in cycles eventually let the cookie settle, so
// the issue looked non-deterministic.
//
// The fix is to do **everything** that decides the destination
// on the server, on a single Supabase client reading through the
// just-issued session. `redirect()` is the framework's atomic
// post-action navigation, and it cannot be raced by a component
// re-render. This is the only place that decides the
// post-login destination now (Issue 1 in the DEBUGGING plan).
//
// Safety properties
// -----------------
//   * Validates the input with the same Zod schema as the form
//     (the only validation contract on both client + server).
//   * Maps Supabase Auth errors to a localised, user-safe string
//     and re-throws as a plain `Error` so React's error
//     boundary on the form can show it.
//   * `?next=` is honoured only when it stays inside the current
//     locale prefix (`/${locale}/...`). Anything else is
//     replaced with the role-based default — same heuristic as
//     the old client form, so users who clicked a
//     `?error=forbidden` deep link are still bounced to the
//     correct dashboard.
//   * No service-role key, no new RLS, no middleware changes.
// =====================================================================

export interface LoginActionInput {
  email: string;
  password: string;
  locale: string;
  next: string | null;
}

export interface LoginActionError {
  code: 'validation' | 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'unknown';
  message: string;
  // Echoed back so the form's RHF `setError` (or the serverError
  // banner) can highlight the field without a second round-trip.
  field?: 'email' | 'password';
}

function mapAuthError(
  err: { code?: string; message?: string; status?: number } | null,
): LoginActionError {
  if (!err) {
    return { code: 'unknown', message: 'Erreur inconnue. Réessayez.' };
  }
  const code = (err.code ?? '').toLowerCase();
  const status = typeof err.status === 'number' ? err.status : 0;
  if (code === 'invalid_credentials' || status === 401) {
    return {
      code: 'invalid_credentials',
      message: 'E-mail ou mot de passe incorrect.',
      field: 'password',
    };
  }
  if (code === 'email_not_confirmed') {
    return {
      code: 'email_not_confirmed',
      message: 'Veuillez confirmer votre adresse e-mail avant de vous connecter.',
      field: 'email',
    };
  }
  if (code === 'rate_limited' || code === 'over_email_send_rate_limit' || status === 429) {
    return {
      code: 'rate_limited',
      message: 'Trop de tentatives. Réessayez dans quelques minutes.',
    };
  }
  return { code: 'unknown', message: 'Erreur inconnue. Réessayez.' };
}

function resolveLocale(raw: string): Locale {
  if (isLocale(raw)) return raw;
  return defaultLocale;
}

// `safeNext` accepts only a same-locale, relative URL. This
// matches the pre-existing client-side guard in `LoginForm` so
// the UX is unchanged for deep links such as
// `/en/dashboard?error=forbidden`.
function safeNextPath(locale: Locale, next: string | null): string | null {
  if (!next) return null;
  // Must be a relative URL starting with the locale prefix.
  if (!next.startsWith(`/${locale}/`) && next !== `/${locale}`) return null;
  // Reject protocol-relative or external URLs.
  if (next.startsWith('//')) return null;
  // Reject anything with a scheme.
  if (/^\/[a-z]+:/i.test(next)) return null;
  return next;
}

function roleLandingPath(locale: Locale, role: Profile['role']): string {
  if (role === 'admin' || role === 'super_admin') return `/${locale}/admin`;
  return `/${locale}/dashboard`;
}

/**
 * Sign in with email + password and redirect the user to the
 * correct dashboard for their role. The redirect happens via
 * `redirect()` from `next/navigation`; this Server Action does
 * not return a value in the success path.
 *
 * The client form is the only caller. The form must `try/catch`
 * the call: on a thrown `LoginActionError` it surfaces the
 * message in its existing `serverError` slot; on a successful
 * return the `redirect()` has already navigated the browser.
 */
export async function loginAction(input: LoginActionInput): Promise<never> {
  const locale = resolveLocale(input.locale);

  // 1. Validate the input on the server. The client form
  //    already does this with the same Zod schema, but we never
  //    trust the client.
  const t = (k: string): string => k; // placeholder; we only need
  // the .refine() message keys, the action's *user-facing*
  // strings are all the localised `LoginActionError` strings
  // above. The Zod schema is rebuilt for its shape only.
  const { loginSchema } = makeAuthSchemas(t);
  const parsed = loginSchema.safeParse({ email: input.email, password: input.password });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field: LoginActionError['field'] =
      issue?.path[0] === 'password' ? 'password' : 'email';
    throw new Error(
      JSON.stringify({
        code: 'validation',
        message: issue?.message ?? 'Saisie invalide.',
        field,
      } satisfies LoginActionError),
    );
  }
  const values: LoginInput = parsed.data;

  // 2. Sign in on the server. `@supabase/ssr` will set the
  //    session cookie through the Next.js cookie store; the
  //    framework rolls that into the response that carries
  //    the eventual `redirect()`.
  const supabase = await createSupabaseServerClient();
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: values.email,
    password: values.password,
  });

  if (signInError || !signIn.user) {
    const mapped = mapAuthError(signInError);
    logger.warn('loginAction: sign-in failed', {
      email: values.email,
      code: mapped.code,
    });
    throw new Error(JSON.stringify(mapped));
  }

  // 3. Read the role on the server, through the same Supabase
  //    client that just authenticated the request. The
  //    `profiles_select_own_or_admin` RLS policy allows a
  //    signed-in user to read their own row, so no
  //    service-role key is required.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', signIn.user.id)
    .maybeSingle();

  if (profileError) {
    logger.error('loginAction: profile read failed', describeError(profileError));
    // The sign-in succeeded but the profile row is unreadable.
    // Bounce the user to the safe student dashboard; the
    // server-side role guard in /dashboard will re-evaluate
    // on the next request.
    redirect(`/${locale}/dashboard`);
  }

  const role: Profile['role'] = (profile as Profile | null)?.role ?? 'student';

  // 4. Decide the destination. `?next=` still wins when it
  //    stays inside the locale prefix; otherwise the role
  //    decides.
  const dest = safeNextPath(locale, input.next) ?? roleLandingPath(locale, role);

  logger.info('loginAction: redirect', { email: values.email, role, dest });

  // 5. Server-side, framework-handled redirect. This throws a
  //    NEXT_REDIRECT sentinel; the framework catches it and
  //    navigates the browser. We never reach the next line.
  redirect(dest);
}
