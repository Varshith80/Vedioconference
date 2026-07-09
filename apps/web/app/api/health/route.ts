import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { resend } from '@/lib/email/client';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

const startedAt = Date.now();

/** GET /api/health – liveness + readiness probe. */
export async function GET() {
  const checks: Record<string, 'ok' | string> = {};

  // Database
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
    checks.database = error ? error.message : 'ok';
  } catch (e) { checks.database = (e as Error).message; }

  // Stripe
  try {
    await stripe().balance.retrieve();
    checks.stripe = 'ok';
  } catch (e) { checks.stripe = (e as Error).message; }

  // Resend
  try {
    resend(); // instantiate only
    checks.resend = 'ok';
  } catch (e) { checks.resend = (e as Error).message; }

  // n8n
  try {
    const env = serverEnv();
    const url = env.N8N_BASE_URL;
    if (!url) throw new Error('N8N_BASE_URL not configured');
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
    checks.n8n = res.ok ? 'ok' : `HTTP ${res.status}`;
  } catch (e) { checks.n8n = (e as Error).message; }

  const allOk = Object.values(checks).every((c) => c === 'ok');
  logger.debug('health', checks);
  return Response.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? '0.0.0',
    },
    { status: allOk ? 200 : 503 },
  );
}
