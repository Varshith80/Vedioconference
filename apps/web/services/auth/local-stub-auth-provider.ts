import type {
  AuthProvider,
  AuthResult,
  AuthSession,
  AuthSubscription,
  SignInInput,
  SignUpInput,
  ResetPasswordInput,
  UpdatePasswordInput,
  VerifyOtpInput,
} from '@/types/auth';
import type { User } from '@/types/user';
import { authError } from '@/types/errors';

/**
 * The B1 stub auth provider. Persists users in `localStorage`,
 * signs users in synchronously after a 250ms fake latency, and
 * emits a change to subscribers on every state transition. It
 * enforces a minimum password length and rejects duplicate e-mails
 * so the UI surfaces real errors.
 *
 * It is *not* a security boundary. B2 replaces it with the
 * Supabase-backed provider.
 */

const STORAGE_KEY = 'integrale.auth.stub.v1';
const PASSWORD_MIN = 8;

interface StoredUser extends User {
  /** Plaintext password. Stub-only — never do this in production. */
  password: string;
}

interface StoredState {
  users: StoredUser[];
  /** The id of the currently signed-in user, or null. */
  currentUserId: string | null;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readState(): StoredState {
  if (!isBrowser()) return { users: [], currentUserId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { users: [], currentUserId: null };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      currentUserId: typeof parsed.currentUserId === 'string' ? parsed.currentUserId : null,
    };
  } catch {
    return { users: [], currentUserId: null };
  }
}

function writeState(state: StoredState): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — degrade silently. The
    // auth UI will appear to "forget" the user; not a security issue.
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSession(user: User): AuthSession {
  return {
    user,
    accessToken: `stub.${user.id}.${Date.now()}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublicUser(u: StoredUser): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    createdAt: u.createdAt,
  };
}

export class LocalStubAuthProvider implements AuthProvider {
  readonly id = 'local-stub';

  private listeners = new Set<(session: AuthSession | null) => void>();

  async getSession(): Promise<AuthResult<AuthSession | null>> {
    await wait(50);
    const state = readState();
    if (!state.currentUserId) return { ok: true, data: null };
    const u = state.users.find((x) => x.id === state.currentUserId);
    if (!u) return { ok: true, data: null };
    return { ok: true, data: buildSession(toPublicUser(u)) };
  }

  async signInWithPassword({ email, password }: SignInInput): Promise<AuthResult<AuthSession>> {
    await wait(250);
    const state = readState();
    const u = state.users.find((x) => x.email === email.toLowerCase());
    if (!u || u.password !== password) {
      return {
        ok: false,
        error: authError('invalid_credentials', 'E-mail ou mot de passe incorrect.'),
      };
    }
    writeState({ ...state, currentUserId: u.id });
    const session = buildSession(toPublicUser(u));
    this.emit(session);
    return { ok: true, data: session };
  }

  async signUp({ email, password, fullName }: SignUpInput): Promise<AuthResult<AuthSession>> {
    await wait(250);
    if (password.length < PASSWORD_MIN) {
      return {
        ok: false,
        error: authError(
          'weak_password',
          `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`,
        ),
      };
    }
    const state = readState();
    const normalized = email.toLowerCase();
    if (state.users.some((x) => x.email === normalized)) {
      return {
        ok: false,
        error: authError('email_taken', 'Un compte existe déjà avec cette adresse e-mail.'),
      };
    }
    const newUser: StoredUser = {
      id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      email: normalized,
      fullName,
      createdAt: nowIso(),
      password,
    };
    writeState({
      users: [...state.users, newUser],
      currentUserId: newUser.id,
    });
    const session = buildSession(toPublicUser(newUser));
    this.emit(session);
    return { ok: true, data: session };
  }

  async signOut(): Promise<AuthResult<void>> {
    await wait(50);
    const state = readState();
    writeState({ ...state, currentUserId: null });
    this.emit(null);
    return { ok: true, data: undefined };
  }

  async resetPasswordForEmail(_input: ResetPasswordInput): Promise<AuthResult<void>> {
    // In the stub we just resolve; the real provider will fire the
    // transactional e-mail via Resend + n8n.
    await wait(250);
    return { ok: true, data: undefined };
  }

  async updatePassword({ password }: UpdatePasswordInput): Promise<AuthResult<User>> {
    await wait(250);
    if (password.length < PASSWORD_MIN) {
      return {
        ok: false,
        error: authError(
          'weak_password',
          `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`,
        ),
      };
    }
    const state = readState();
    if (!state.currentUserId) {
      return { ok: false, error: authError('not_authenticated', 'Non connecté.') };
    }
    const updated = state.users.map((u) =>
      u.id === state.currentUserId ? { ...u, password } : u,
    );
    const me = updated.find((u) => u.id === state.currentUserId);
    if (!me) {
      return { ok: false, error: authError('not_authenticated', 'Non connecté.') };
    }
    writeState({ ...state, users: updated });
    return { ok: true, data: toPublicUser(me) };
  }

  async verifyOtp({ token, type }: VerifyOtpInput): Promise<AuthResult<AuthSession>> {
    await wait(250);
    // The stub accepts any 6+ character token; anything else is invalid.
    if (token.length < 6) {
      return {
        ok: false,
        error: authError('invalid_token', 'Code de vérification invalide.'),
      };
    }
    // B1: if a current user exists, return their session. Otherwise
    // we have no way to recover the user from the token alone; the
    // B2 provider will resolve this properly.
    const state = readState();
    const me = state.currentUserId
      ? state.users.find((u) => u.id === state.currentUserId) ?? null
      : null;
    if (!me) {
      return {
        ok: false,
        error: authError('not_authenticated', 'Session expirée. Reconnectez-vous.'),
      };
    }
    void type; // accepted but not consumed in the stub
    return { ok: true, data: buildSession(toPublicUser(me)) };
  }

  onAuthStateChange(cb: (session: AuthSession | null) => void): AuthSubscription {
    this.listeners.add(cb);
    return {
      unsubscribe: () => {
        this.listeners.delete(cb);
      },
    };
  }

  private emit(session: AuthSession | null): void {
    for (const cb of this.listeners) {
      try {
        cb(session);
      } catch {
        // never let a bad listener break the auth flow
      }
    }
  }
}
