'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type GrantStatus = 'pending_payment' | 'active' | 'completed' | 'cancelled' | 'refunded';

interface SessionGrantCheckoutCardProps {
  sessionGrantId: string;
  status: GrantStatus;
  /** Display title of the session (e.g. "Algebra · Session 1"). */
  sessionTitle: string;
  /** Price in cents (for the "you will be charged" line). */
  amountCents: number;
  currency: string;
  locale: 'en' | 'fr';
}

/**
 * Client-side card for the `/[locale]/checkout/session-grant/[id]`
 * page. Calls `POST /api/session-grants/[id]/stripe-session` to
 * get the existing Stripe Checkout URL (resume) OR creates a
 * fresh one (the `POST /api/session-grants` path on the public
 * session detail page).
 *
 * When the grant is already `active`/`completed` the card
 * shows a "Continue to dashboard" link instead of the
 * "Pay with Stripe" button.
 */
export function SessionGrantCheckoutCard(props: SessionGrantCheckoutCardProps) {
  const router = useRouter();
  const t = useTranslations('Checkout.sessionGrant');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  if (props.status === 'active' || props.status === 'completed') {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            {props.sessionTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('alreadyPaidDescription')}
          </p>
          <Button asChild className="mt-4">
            <a href={`/${props.locale}/dashboard/sessions`}>{t('goToDashboard')}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function handlePay() {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      // Try to resume the existing Stripe Checkout Session first.
      const res = await fetch(
        `/api/session-grants/${props.sessionGrantId}/stripe-session`,
        { method: 'GET' },
      );
      if (res.ok) {
        const body = (await res.json()) as { data: { stripe_session_id: string } };
        // Redirect to the Stripe-hosted Checkout using the
        // session id (the resume URL is reconstructed client-side
        // — the route returns only the id; the real Stripe-hosted
        // URL is the `stripe_session_id` mapped to a Checkout page
        // on the Stripe side).
        window.location.href = `https://checkout.stripe.com/c/pay/${body.data.stripe_session_id}`;
        return;
      }
      // No existing session id yet. The user should re-open the
      // session detail page and click "Buy" again. Surface a
      // friendly message.
      const errBody = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      setErrorCode(errBody?.error?.code ?? 'unknown');
      setError(
        errBody?.error?.message ??
          'Your checkout session is still being prepared. Please return to the session detail page and try again.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-heading text-2xl font-semibold text-foreground">
          {props.sessionTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
        <p className="mt-4 text-2xl font-bold text-foreground">
          {(props.amountCents / 100).toFixed(2)} {props.currency.toUpperCase()}
        </p>
        <Button onClick={handlePay} disabled={isLoading} className="mt-6 w-full" size="lg">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t('payButton')}
        </Button>
        {error ? (
          <p
            role="alert"
            className="mt-3 text-sm text-destructive"
          >
            {error}
            {errorCode ? <span className="ml-2 text-xs text-muted-foreground">({errorCode})</span> : null}
          </p>
        ) : null}
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t('secureNote')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          onClick={() => router.push(`/${props.locale}/dashboard/sessions`)}
        >
          {t('cancel')}
        </Button>
      </CardContent>
    </Card>
  );
}
