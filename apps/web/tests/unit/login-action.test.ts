import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the Sprint 3.7 login Server Action (`app/[locale]/
// auth/login/actions.ts`). The action is the **only** place
// that decides the post-login destination now; the client
// form is a thin wrapper that calls it.
//
// The action:
//   1. Parses the form with the same Zod schema as the client.
//   2. Calls `supabase.auth.signInWithPassword` on the **server**
//      client (cookie-backed session).
//   3. Reads `public.profiles.role` via the same authenticated
//      client.
//   4. `redirect()`s to /<locale>/admin for admin/super_admin,
//      to /<locale>/dashboard for student, or to the safe
//      `?next=` when it stays inside the locale prefix.
//
// We mock both the server Supabase client and `next/navigation`'s
// `redirect`, then assert the destination for each case.

// ----- Mocks ------------------------------------------------------------

// `vi.mock` factory bodies are hoisted to the top of the file
// by vitest; they cannot reference module-level `const`s
// declared after them (the TDZ bites). `vi.hoisted` lets us
// share mutable mock handles between the factory and the test
// body.
const mocks = vi.hoisted(() => {
  return {
    mockSignIn: vi.fn(),
    mockProfileEq: vi.fn(),
    mockProfileMaybeSingle: vi.fn(),
    mockProfileSelect: vi.fn(),
    mockProfileFrom: vi.fn(),
    mockRedirect: vi.fn((url: string) => {
      // Mirror the framework's behaviour: throw a
      // `NEXT_REDIRECT` sentinel with a `digest` carrying the
      // URL.
      const err = new Error(`NEXT_REDIRECT;replace;${url};307;`);
      (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
      throw err;
    }),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signInWithPassword: mocks.mockSignIn,
      },
      from: mocks.mockProfileFrom,
    }),
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.mockRedirect,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { loginAction, type LoginActionError } from '@/app/[locale]/auth/login/actions';

const {
  mockSignIn,
  mockProfileEq,
  mockProfileMaybeSingle,
  mockProfileSelect,
  mockProfileFrom,
  mockRedirect,
} = mocks;

// ----- Helpers -----------------------------------------------------------

function setupSignInSuccess() {
  mockSignIn.mockResolvedValueOnce({
    data: { user: { id: 'user-1', email: 'a@b.com' } },
    error: null,
  });
}

function setupSignInFailure(code = 'invalid_credentials') {
  mockSignIn.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: { code, message: 'bad' },
  });
}

function setupProfile(role: 'student' | 'admin' | 'super_admin' | null) {
  if (role === null) {
    mockProfileMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  } else {
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: { id: 'user-1', role },
      error: null,
    });
  }
}

function expectRedirectTo(url: string) {
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  expect(mockRedirect).toHaveBeenCalledWith(url);
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockProfileEq.mockReset();
  mockProfileMaybeSingle.mockReset();
  mockProfileSelect.mockReset();
  mockProfileFrom.mockReset();
  mockRedirect.mockReset();
  // Re-wire the chain: `from('profiles')` → { select } → { eq } → { maybeSingle }.
  // `mockProfileFrom` is the *default* implementation; tests
  // that need different behaviour can override it with
  // `mockProfileFrom.mockImplementationOnce(...)`.
  mockProfileFrom.mockImplementation(() => ({ select: mockProfileSelect }));
  mockProfileSelect.mockReturnValue({ eq: mockProfileEq });
  mockProfileEq.mockReturnValue({ maybeSingle: mockProfileMaybeSingle });
});

// ----- Tests ------------------------------------------------------------

describe('loginAction — success paths', () => {
  it('redirects an admin to /en/admin', async () => {
    setupSignInSuccess();
    setupProfile('admin');
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: null,
    });
    expectRedirectTo('/en/admin');
  });

  it('redirects a super_admin to /en/admin', async () => {
    setupSignInSuccess();
    setupProfile('super_admin');
    await loginAction({
      email: 'root@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: null,
    });
    expectRedirectTo('/en/admin');
  });

  it('redirects a student to /en/dashboard', async () => {
    setupSignInSuccess();
    setupProfile('student');
    await loginAction({
      email: 'alice@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: null,
    });
    expectRedirectTo('/en/dashboard');
  });

  it('honours ?next= when it stays inside the locale prefix (admin)', async () => {
    setupSignInSuccess();
    setupProfile('admin');
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'fr',
      next: '/fr/admin/payments',
    });
    expectRedirectTo('/fr/admin/payments');
  });

  it('honours ?next= when it stays inside the locale prefix (student)', async () => {
    setupSignInSuccess();
    setupProfile('student');
    await loginAction({
      email: 'alice@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: '/en/dashboard/sessions',
    });
    expectRedirectTo('/en/dashboard/sessions');
  });

  it('ignores an external ?next= and falls back to the role default', async () => {
    setupSignInSuccess();
    setupProfile('admin');
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: '//evil.com/path',
    });
    expectRedirectTo('/en/admin');
  });

  it('ignores a cross-locale ?next= and falls back to the role default', async () => {
    setupSignInSuccess();
    setupProfile('admin');
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: '/fr/admin',
    });
    expectRedirectTo('/en/admin');
  });

  it('ignores a scheme-prefixed ?next= and falls back to the role default', async () => {
    setupSignInSuccess();
    setupProfile('admin');
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: '/javascript:alert(1)',
    });
    expectRedirectTo('/en/admin');
  });

  it('redirects the admin to /en/admin when the profile row is missing (defensive)', async () => {
    // A brand-new signup whose `handle_new_user` trigger has
    // not yet provisioned a profile row. The action degrades
    // gracefully by treating it as a student and sending to
    // /dashboard — and the dashboard layout's own role guard
    // will re-evaluate on the next request.
    setupSignInSuccess();
    setupProfile(null);
    await loginAction({
      email: 'admin@example.com',
      password: 'correct-horse-battery-staple',
      locale: 'en',
      next: null,
    });
    expectRedirectTo('/en/dashboard');
  });
});

describe('loginAction — error paths', () => {
  it('throws a JSON-encoded LoginActionError on invalid credentials', async () => {
    setupSignInFailure('invalid_credentials');
    let caught: unknown = null;
    try {
      await loginAction({
        email: 'admin@example.com',
        password: 'wrong',
        locale: 'en',
        next: null,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const parsed = JSON.parse((caught as Error).message) as LoginActionError;
    expect(parsed.code).toBe('invalid_credentials');
    expect(parsed.field).toBe('password');
    expect(parsed.message).toMatch(/incorrect/i);
  });

  it('throws a JSON-encoded LoginActionError on rate limit', async () => {
    setupSignInFailure('rate_limited');
    let caught: unknown = null;
    try {
      await loginAction({
        email: 'admin@example.com',
        password: 'wrong',
        locale: 'en',
        next: null,
      });
    } catch (e) {
      caught = e;
    }
    const parsed = JSON.parse((caught as Error).message) as LoginActionError;
    expect(parsed.code).toBe('rate_limited');
  });

  it('throws a JSON-encoded LoginActionError on email_not_confirmed', async () => {
    setupSignInFailure('email_not_confirmed');
    let caught: unknown = null;
    try {
      await loginAction({
        email: 'admin@example.com',
        password: 'wrong',
        locale: 'en',
        next: null,
      });
    } catch (e) {
      caught = e;
    }
    const parsed = JSON.parse((caught as Error).message) as LoginActionError;
    expect(parsed.code).toBe('email_not_confirmed');
    expect(parsed.field).toBe('email');
  });
});
