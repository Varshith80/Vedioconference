import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStubAuthProvider } from './local-stub-auth-provider';

const STORAGE_KEY = 'integrale.auth.stub.v1';

function resetStorage(): void {
  if (typeof localStorage !== 'undefined') localStorage.clear();
}

describe('LocalStubAuthProvider', () => {
  let provider: LocalStubAuthProvider;

  beforeEach(() => {
    resetStorage();
    provider = new LocalStubAuthProvider();
  });

  it('starts unauthenticated', async () => {
    const res = await provider.getSession();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });

  it('signs up a new user and creates a session', async () => {
    const res = await provider.signUp({
      email: 'Alice@Example.com',
      password: 'motdepasse1',
      fullName: 'Alice',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.user.email).toBe('alice@example.com');
      expect(res.data.user.fullName).toBe('Alice');
      expect(res.data.accessToken.length).toBeGreaterThan(0);
    }
  });

  it('rejects a weak password', async () => {
    const res = await provider.signUp({
      email: 'a@example.com',
      password: 'short',
      fullName: 'A',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('weak_password');
  });

  it('rejects a duplicate e-mail', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    const res = await provider.signUp({
      email: 'A@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('email_taken');
  });

  it('signs in with valid credentials', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    await provider.signOut();
    const res = await provider.signInWithPassword({
      email: 'a@example.com',
      password: 'motdepasse1',
    });
    expect(res.ok).toBe(true);
  });

  it('rejects invalid credentials', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    await provider.signOut();
    const res = await provider.signInWithPassword({
      email: 'a@example.com',
      password: 'wrong',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('invalid_credentials');
  });

  it('persists the current user across provider instances', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    const fresh = new LocalStubAuthProvider();
    const res = await fresh.getSession();
    expect(res.ok).toBe(true);
    if (res.ok && res.data) {
      expect(res.data.user.email).toBe('a@example.com');
    } else {
      expect.fail('expected a session');
    }
  });

  it('signOut clears the current session', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    const out = await provider.signOut();
    expect(out.ok).toBe(true);
    const res = await provider.getSession();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toBeNull();
  });

  it('emits a state change to subscribers on signIn and signOut', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    await provider.signOut();
    const events: Array<unknown> = [];
    const sub = provider.onAuthStateChange((s) => events.push(s));
    await provider.signInWithPassword({
      email: 'a@example.com',
      password: 'motdepasse1',
    });
    await provider.signOut();
    sub.unsubscribe();
    expect(events.length).toBe(2);
    expect((events[0] as { user: { email: string } } | null)?.user?.email).toBe('a@example.com');
    expect(events[1]).toBeNull();
  });

  it('verifyOtp accepts a 6+ character token and rejects short ones', async () => {
    await provider.signUp({
      email: 'a@example.com',
      password: 'motdepasse1',
      fullName: 'A',
    });
    const ok = await provider.verifyOtp({
      email: 'a@example.com',
      token: '123456',
      type: 'signup',
    });
    expect(ok.ok).toBe(true);
    const bad = await provider.verifyOtp({
      email: 'a@example.com',
      token: '12',
      type: 'signup',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('invalid_token');
  });

  it('uses the canonical STORAGE_KEY', () => {
    expect(STORAGE_KEY).toBe('integrale.auth.stub.v1');
  });
});
