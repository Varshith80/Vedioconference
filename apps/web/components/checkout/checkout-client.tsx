'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';

type EnrollmentStatus = 'pending_payment' | 'active' | 'completed' | 'cancelled' | 'refunded';

/**
 * `components/checkout/checkout-client.tsx` — the interactive
 * piece of the checkout page. The user clicks "Pay with Stripe"
 * and the component:
 *
 *   1. POSTs to `/api/enrollments/checkout` with the enrollment
 *      id.
 *   2. Reads the returned `checkout_url` (a Stripe-hosted URL).
 *   3. Redirects the browser to it.
 *
 * When the enrollment is already `active` (i.e. the user paid
 * and returned to this page), the component shows a "Continue
 * to dashboard" link instead of the button.
 *
 * When the response is a 503 (n8n not configured), the component
 * shows a clear "Checkout is being prepared" message.
 */
export interface CheckoutClientProps {
  enrollmentId:     string;
  enrollmentStatus: EnrollmentStatus;
  locale:           'en' | 'fr';
}

export function CheckoutClient(props: CheckoutClientProps) {
  const router = useRouter();
  const t = useTranslations('Checkout.enrollment');
  const [isLoading, setIsLoading]   = React.useState(false);
  const [error, setError]           = React.useState<string | null>(null);
  const [errorCode, setErrorCode]   = React.useState<string | null>(null);

  if (props.enrollmentStatus === 'active' || props.enrollmentStatus === 'completed') {
    return (
      <div className="mt-6 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">{t('alreadyPaid')}</p>
        <button
          type="button"
          onClick={() => router.push(`/${props.locale}/dashboard`)}
          className="mt-2 inline-flex items-center justify-center rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {t('goToDashboard')}
        </button>
      </div>
    );
  }

  if (props.enrollmentStatus !== 'pending_payment') {
    return (
      <div className="mt-6 rounded-md border bg-muted p-4 text-sm text-muted-foreground">
        {t('enrollmentInactive', { status: props.enrollmentStatus })}
      </div>
    );
  }

  const handleCheckout = async () => {
    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const response = await fetch('/api/enrollments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ enrollment_id: props.enrollmentId }),
      });
      const body = await response.json().catch(() => null) as
        | { ok: true; data: { checkout_url: string } }
        | { error: { code: string; message: string } }
        | null;
      if (!response.ok || !body) {
        const code = (body as { error?: { code: string } } | null)?.error?.code ?? 'unknown';
        const message = (body as { error?: { message: string } } | null)?.error?.message ?? t('errorGeneric');
        setError(message);
        setErrorCode(code);
        return;
      }
      if ('ok' in body && body.ok) {
        window.location.href = body.data.checkout_url;
        return;
      }
      setError(t('errorGeneric'));
      setErrorCode('unknown');
    } catch {
      setError(t('errorNetwork'));
      setErrorCode('network');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={isLoading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden={true} /> : <ShieldCheck className="h-4 w-4" aria-hidden={true} />}
        {t('payButton')}
      </button>
      {error ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-medium">{error}</p>
          {errorCode === 'checkout_unavailable' ? (
            <p className="mt-1 text-xs text-amber-800">{t('errorCheckoutUnavailable')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
