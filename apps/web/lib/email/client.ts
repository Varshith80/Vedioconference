import { Resend } from 'resend';

let _resend: Resend | null = null;

/** Lazy, server-only Resend client. */
export function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not configured.');
    _resend = new Resend(key);
  }
  return _resend;
}
