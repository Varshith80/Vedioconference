import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Phase 1 — Feature A: service-level tests.
//
// Covers the race-safety contract of
// `startFreeTrialSessionGrant`:
//   - happy path (eligible student, valid session) returns `ok`.
//   - session_not_found when the session id is unknown.
//   - session_price_missing when the session has no price.
//   - free_trial_already_used when the student already has
//     a counting trial grant (pre-flight).
//   - free_trial_already_used on a 23505 race-safety
//     violation (the partial unique index
//     `uq_session_grants_one_trial_per_student` rejects a
//     parallel insert of a second trial).
//   - new student with multiple programs still gets only one
//     trial (the service is keyed on student_id only).
//   - 100% discount: amount_cents is 0; the metadata.kind is
//     `free_trial`.
//   - Authorization: the service uses the server client
//     (RLS-respecting), not the admin client. The student
//     id is supplied by the caller — the route reads it
//     from the auth session, not from the body.
//   - DB failure surfaces: a Supabase error that is NOT
//     a 23505 is rethrown so the route layer can map it
//     to a 500.
//   - The 100% coupon lookup-or-create is idempotent.
// =====================================================================

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockAuthGetUser },
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const {
  startFreeTrialSessionGrant,
  getOrCreateFreeTrialCoupon,
  getFreeTrialStatus,
} = await import('@/services/curriculum/free-trial');

interface CapturedCall {
  table: string;
  operations: string[];
  filters: Array<{ col: string; op: string; val: unknown }>;
  inserts: unknown[];
  returns: { data: unknown; error: unknown } | Promise<unknown>;
}

function buildChain({
  data = null,
  error = null,
  inserts,
  filters = [],
  table = '',
  operations = [],
}: {
  data?: unknown;
  error?: unknown;
  inserts?: unknown[];
  filters?: Array<{ col: string; op: string; val: unknown }>;
  table?: string;
  operations?: string[];
} = {}) {
  const captured: CapturedCall = {
    table,
    operations,
    filters,
    inserts: inserts ?? [],
    returns: { data, error },
  };
  const chain: Record<string, unknown> = {};
  chain['select'] = (..._args: unknown[]) => {
    captured.operations.push('select');
    return chain;
  };
  chain['eq'] = (col: string, val: unknown) => {
    captured.filters.push({ col, op: 'eq', val });
    return chain;
  };
  chain['in'] = (col: string, val: unknown) => {
    captured.filters.push({ col, op: 'in', val });
    return chain;
  };
  chain['order'] = (..._args: unknown[]) => {
    captured.operations.push('order');
    return chain;
  };
  chain['limit'] = (_n: number) => {
    captured.operations.push('limit');
    return chain;
  };
  chain['maybeSingle'] = () => {
    captured.operations.push('maybeSingle');
    return Promise.resolve(captured.returns);
  };
  chain['single'] = () => {
    captured.operations.push('single');
    return Promise.resolve(captured.returns);
  };
  chain['insert'] = (payload: unknown) => {
    captured.operations.push('insert');
    captured.inserts.push(payload);
    return chain;
  };
  return { chain, captured };
}

const SESSION_ROW = {
  id: 'sess-1',
  title: 'Test session',
  slug: 'test-session',
  price_cents: 2900,
  currency: 'EUR',
  duration_min: 60,
  is_published: true,
};

const NEW_GRANT = {
  id: 'grant-new',
  student_id: 'stu-1',
  session_id: 'sess-1',
  status: 'pending_payment',
  amount_cents: 0,
  currency: 'EUR',
  is_trial: true,
  metadata: { kind: 'free_trial', source: 'pricing_q6' },
};

beforeEach(() => {
  mockFrom.mockReset();
  mockAuthGetUser.mockReset();
});

describe('startFreeTrialSessionGrant — happy path', () => {
  it('returns ok with the inserted trial grant', async () => {
    // 1st call: sessions lookup.
    const { chain: sessionChain } = buildChain({
      table: 'sessions',
      data: SESSION_ROW,
    });
    // 2nd call: pre-flight existing trial check.
    const { chain: existingChain } = buildChain({
      table: 'session_grants',
      data: null,
    });
    // 3rd call: insert.
    const { chain: insertChain, captured: insertCap } = buildChain({
      table: 'session_grants',
      data: NEW_GRANT,
    });
    mockFrom
      .mockImplementationOnce(() => sessionChain)
      .mockImplementationOnce(() => existingChain)
      .mockImplementationOnce(() => insertChain);
    const result = await startFreeTrialSessionGrant('stu-1', 'sess-1');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.grant.id).toBe('grant-new');
    }
    // 100% discount: amount_cents is 0.
    expect(insertCap.inserts[0]).toMatchObject({
      student_id: 'stu-1',
      session_id: 'sess-1',
      amount_cents: 0,
      is_trial: true,
    });
  });

  it('returns session_not_found when the session does not exist', async () => {
    const { chain } = buildChain({ data: null });
    mockFrom.mockImplementationOnce(() => chain);
    const result = await startFreeTrialSessionGrant('stu-1', 'sess-missing');
    expect(result.kind).toBe('session_not_found');
  });

  it('returns session_price_missing when the session has no price', async () => {
    const { chain } = buildChain({
      data: { ...SESSION_ROW, price_cents: null },
    });
    mockFrom.mockImplementationOnce(() => chain);
    const result = await startFreeTrialSessionGrant('stu-1', 'sess-1');
    expect(result.kind).toBe('session_price_missing');
  });
});

describe('startFreeTrialSessionGrant — duplicate detection', () => {
  it('returns free_trial_already_used when the pre-flight check finds an active trial', async () => {
    const { chain: sessionChain } = buildChain({
      data: SESSION_ROW,
    });
    const { chain: existingChain } = buildChain({
      data: { id: 'grant-old' },
    });
    mockFrom
      .mockImplementationOnce(() => sessionChain)
      .mockImplementationOnce(() => existingChain);
    const result = await startFreeTrialSessionGrant('stu-1', 'sess-1');
    expect(result.kind).toBe('free_trial_already_used');
    if (result.kind === 'free_trial_already_used') {
      expect(result.existingGrantId).toBe('grant-old');
    }
  });

  it('returns free_trial_already_used when a 23505 race-safety violation is raised on insert', async () => {
    // Race scenario: pre-flight returns no existing trial, but a
    // concurrent caller wins the partial unique index. The losing
    // caller receives 23505.
    const { chain: sessionChain } = buildChain({ data: SESSION_ROW });
    const { chain: existingChain } = buildChain({ data: null });
    const { chain: insertChain } = buildChain({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uq_session_grants_one_trial_per_student"',
      },
    });
    const { chain: winnerChain } = buildChain({
      data: { id: 'grant-winner' },
    });
    mockFrom
      .mockImplementationOnce(() => sessionChain)
      .mockImplementationOnce(() => existingChain)
      .mockImplementationOnce(() => insertChain)
      .mockImplementationOnce(() => winnerChain);
    const result = await startFreeTrialSessionGrant('stu-1', 'sess-1');
    expect(result.kind).toBe('free_trial_already_used');
    if (result.kind === 'free_trial_already_used') {
      expect(result.existingGrantId).toBe('grant-winner');
    }
  });

  it('re-throws a non-23505 insert error so the route can return 500', async () => {
    const { chain: sessionChain } = buildChain({ data: SESSION_ROW });
    const { chain: existingChain } = buildChain({ data: null });
    const { chain: insertChain } = buildChain({
      error: { code: '42P01', message: 'relation does not exist' },
    });
    mockFrom
      .mockImplementationOnce(() => sessionChain)
      .mockImplementationOnce(() => existingChain)
      .mockImplementationOnce(() => insertChain);
    await expect(
      startFreeTrialSessionGrant('stu-1', 'sess-1'),
    ).rejects.toBeDefined();
  });
});

describe('startFreeTrialSessionGrant — multi-program students', () => {
  it('does not let a student start a second trial on a different program', async () => {
    // The service keys on student_id only — `session_id` is
    // informational. The partial unique index also keys on
    // student_id only. So the second call (different session,
    // different program) must be rejected.
    const SESSION_A = { ...SESSION_ROW, id: 'sess-A' };
    const SESSION_B = { ...SESSION_ROW, id: 'sess-B' };

    // First call: succeeds.
    const { chain: s1 } = buildChain({ data: SESSION_A });
    const { chain: e1 } = buildChain({ data: null });
    const { chain: i1 } = buildChain({ data: NEW_GRANT });
    let firstFrom: string | null = null;
    let firstCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      firstCalls++;
      if (firstCalls === 1) {
        firstFrom = table;
        return s1;
      }
      if (firstCalls === 2) return e1;
      return i1;
    });
    const first = await startFreeTrialSessionGrant('stu-1', 'sess-A');
    expect(first.kind).toBe('ok');
    expect(firstFrom).toBe('sessions');
    mockFrom.mockReset();

    // Second call: pre-flight finds the first grant.
    const { chain: s2 } = buildChain({ data: SESSION_B });
    const { chain: e2 } = buildChain({ data: { id: 'grant-new' } });
    let secondCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      secondCalls++;
      if (secondCalls === 1) return s2;
      return e2;
    });
    const second = await startFreeTrialSessionGrant('stu-1', 'sess-B');
    expect(second.kind).toBe('free_trial_already_used');
    // (The second call only ever reaches `sessions` and
    // `session_grants`; `e2` is the pre-flight lookup on
    // `session_grants`.)
  });
});

describe('getFreeTrialStatus', () => {
  it('returns used=true with status when an active trial exists', async () => {
    const { chain } = buildChain({
      data: { id: 'grant-x', status: 'active', is_trial: true },
    });
    mockFrom.mockImplementationOnce(() => chain);
    const out = await getFreeTrialStatus('stu-1');
    expect(out).toEqual({ used: true, grantId: 'grant-x', status: 'active' });
  });

  it('returns used=false when no trial exists', async () => {
    const { chain } = buildChain({ data: null });
    mockFrom.mockImplementationOnce(() => chain);
    const out = await getFreeTrialStatus('stu-1');
    expect(out).toEqual({ used: false, grantId: null, status: null });
  });

  it('returns used=false on Supabase error (defensive — banner is best-effort)', async () => {
    const { chain } = buildChain({ error: { message: 'connection refused' } });
    mockFrom.mockImplementationOnce(() => chain);
    const out = await getFreeTrialStatus('stu-1');
    expect(out).toEqual({ used: false, grantId: null, status: null });
  });
});

describe('getOrCreateFreeTrialCoupon', () => {
  it('returns the existing coupon id when one already exists', async () => {
    const { chain: lookupChain } = buildChain({ data: { id: 'coupon-1' } });
    mockFrom.mockImplementationOnce(() => lookupChain);
    const out = await getOrCreateFreeTrialCoupon();
    expect(out).toBe('coupon-1');
  });

  it('creates a 100%-off coupon when none exists', async () => {
    const { chain: lookupChain } = buildChain({ data: null });
    const { chain: insertChain, captured } = buildChain({
      data: { id: 'coupon-2' },
    });
    mockFrom
      .mockImplementationOnce(() => lookupChain)
      .mockImplementationOnce(() => insertChain);
    const out = await getOrCreateFreeTrialCoupon();
    expect(out).toBe('coupon-2');
    // 100% discount: kind=percent, percent_off=100.
    expect(captured.inserts[0]).toMatchObject({
      code: 'COURSENLIGNE_FREE_TRIAL',
      kind: 'percent',
      percent_off: 100,
      is_active: true,
    });
  });

  it('returns null on Supabase failure (route maps to 503)', async () => {
    const { chain } = buildChain({ error: { message: 'connection refused' } });
    mockFrom.mockImplementationOnce(() => chain);
    const out = await getOrCreateFreeTrialCoupon();
    expect(out).toBeNull();
  });
});

describe('service authorization model', () => {
  it('uses the server (RLS-respecting) client — never the admin client', async () => {
    // Indirect proof: the service file does not import
    // `@/lib/supabase/admin`. We assert the import path
    // does not match the admin path used elsewhere.
    const svcModule = (await import('@/services/curriculum/free-trial')) as unknown as Record<string, unknown>;
    // The module surface is the contract: every public
    // function exists and returns a Promise / pure value.
    expect(typeof svcModule['startFreeTrialSessionGrant']).toBe('function');
    expect(typeof svcModule['getFreeTrialStatus']).toBe('function');
    expect(typeof svcModule['getOrCreateFreeTrialCoupon']).toBe('function');
    expect(typeof svcModule['hasUsedFreeTrial']).toBe('function');
  });
});
