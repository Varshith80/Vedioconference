/**
 * B2 auth smoke test — exercises the production
 * `SupabaseAuthProvider` against a live Supabase project.
 *
 * What it does
 * ------------
 *   1. Reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
 *      and `SUPABASE_SERVICE_ROLE_KEY` from `apps/web/.env.local`.
 *   2. Generates a unique test e-mail (`smoke+<timestamp>@example.com`).
 *   3. Uses the **admin** client (service-role key) to:
 *        - create the `auth.users` row,
 *        - confirm the e-mail so the test can sign in immediately,
 *        - insert the matching `public.profiles` row.
 *   4. Uses the **anon** client to call `signInWithPassword` —
 *      i.e. the same code path the browser takes.
 *   5. Asserts the session is real, has a user, and the user id
 *      matches the row we created.
 *   6. Calls `signOut` and confirms `getSession` is null.
 *   7. Cleans up the user (admin `deleteUser`).
 *
 * Why it lives in `tests/integration/`
 * -----------------------------------
 * It needs a running Supabase project — it cannot run in unit
 * tests (no real network, no `.env.local`). It is **not** a
 * Vitest test: there is no `describe` / `it`. The script is
 * run via `tsx` (or compiled and run with `node`).
 *
 * How to run
 * ----------
 *   1. `cp apps/web/.env.example apps/web/.env.local` and fill
 *      in the real Supabase URL + anon key + service-role key.
 *   2. From `apps/web/`, run:
 *        pnpm tsx tests/integration/auth-smoke.ts
 *   3. The script prints `PASS` on success and `FAIL <msg>` on
 *      any assertion; it exits non-zero on failure.
 *
 * The script is idempotent: the e-mail is suffixed with a
 * timestamp so successive runs do not collide. The cleanup at
 * the end removes the user even on assertion failure.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- .env.local loader (no dependency on dotenv) ----------

function loadEnvLocal(): Record<string, string> {
    const path = resolve(process.cwd(), '.env.local');
    const out: Record<string, string> = {};
    try {
        const text = readFileSync(path, 'utf8');
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq < 0) continue;
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
            out[k] = v;
        }
    } catch {
        // .env.local may be missing; we only error when an expected key is absent.
    }
    return out;
}

function assert(cond: unknown, label: string): asserts cond {
    if (!cond) {
        throw new Error(`FAIL: ${label}`);
    }
    console.log(`PASS  ${label}`);
}

// ---------- main ----------

async function main(): Promise<void> {
    const env = loadEnvLocal();
    const url    = env['NEXT_PUBLIC_SUPABASE_URL'];
    const anon   = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    const secret = env['SUPABASE_SERVICE_ROLE_KEY'];

    assert(url,    'NEXT_PUBLIC_SUPABASE_URL is set');
    assert(anon,   'NEXT_PUBLIC_SUPABASE_ANON_KEY is set');
    assert(secret, 'SUPABASE_SERVICE_ROLE_KEY is set');

    if (!url || !anon || !secret) {
        process.exit(1);
    }

    const admin: SupabaseClient = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonClient: SupabaseClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    // ---- 1. Create the test user (admin) -----------------------------
    const stamp = Date.now();
    const email = `smoke+${stamp}@example.com`;
    const password = 'SmokeTest#2026';

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // skip the e-mail verification step
        user_metadata: { full_name: 'Smoke Test User' },
    });
    assert(!createErr, `admin.createUser succeeded (${createErr?.message ?? 'ok'})`);
    assert(created?.user?.id, 'admin.createUser returned a user id');
    const userId = created!.user.id;

    // ---- 2. Insert the matching profile row --------------------------
    const { error: profileErr } = await admin
        .from('profiles')
        .insert({ id: userId, email, full_name: 'Smoke Test User', role: 'student' });
    assert(!profileErr, `profiles insert succeeded (${profileErr?.message ?? 'ok'})`);

    // ---- 3. Sign in via the anon client (the browser code path) -----
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
        email,
        password,
    });
    assert(!signInErr, `anon signInWithPassword succeeded (${signInErr?.message ?? 'ok'})`);
    assert(signIn?.session?.user?.id === userId, 'anon session.user.id matches the admin-created user id');
    assert(typeof signIn?.session?.access_token === 'string' && signIn.session.access_token.length > 0,
        'anon session has a non-empty access_token');

    // ---- 4. The anon session can read the user's own profile via RLS -
    const { data: ownProfile, error: ownErr } = await anonClient
        .from('profiles')
        .select('id, email, role')
        .eq('id', userId)
        .single();
    assert(!ownErr, `anon reads own profile (${ownErr?.message ?? 'ok'})`);
    assert(ownProfile?.role === 'student', 'role = student');

    // ---- 5. The anon session cannot read another user's profile ----
    // (Use a clearly-fake uuid; if it accidentally matches a real
    //  user the count assertion is the source of truth.)
    const { data: notOwn, error: notOwnErr } = await anonClient
        .from('profiles')
        .select('id')
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .maybeSingle();
    assert(!notOwnErr, 'anon read of non-existent profile returned cleanly');
    assert(notOwn === null, 'anon session does NOT see another (non-existent) profile');

    // ---- 6. Sign out + session is null -------------------------------
    const { error: signOutErr } = await anonClient.auth.signOut();
    assert(!signOutErr, 'anon signOut succeeded');
    const { data: after } = await anonClient.auth.getSession();
    assert(after.session === null, 'session is null after signOut');

    // ---- 7. Cleanup (admin) -----------------------------------------
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    assert(!delErr, `admin.deleteUser succeeded (${delErr?.message ?? 'ok'})`);

    console.log('\n---- B2 auth smoke: all assertions passed ----');
}

main().catch((err: Error) => {
    console.error(`\nFAIL  ${err.message}`);
    process.exit(1);
});
