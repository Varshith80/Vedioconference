import 'server-only';
import { Resend } from 'resend';
import { serverEnv } from '@/lib/env';

let _resend: Resend | null = null;

/** Lazy, server-only Resend client. */
export function resend(): Resend {
  if (!_resend) {
    const env = serverEnv();
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured.');
    }
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}
