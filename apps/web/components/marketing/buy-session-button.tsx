'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BuySessionButtonProps {
  sessionId: string;
  /** Locale-prefixed path to the checkout page after a successful POST. */
  checkoutPathTemplate: string;
  /** Locale-prefixed path to the session detail page (for error toast). */
  sessionPath: string;
}

/**
 * Public "Buy this session" button. Posts to
 * `POST /api/session-grants` with the session id, and on
 * success navigates to the Stripe Checkout redirect
 * (`/checkout/session-grant/[id]`) which itself redirects
 * to Stripe.
 *
 * If the price is missing, the server returns a 422 with
 * the structured error code `session_price_missing`; the
 * button shows a non-blocking toast. If the request fails
 * for any other reason, the toast surfaces the error
 * message.
 */
export function BuySessionButton({
  sessionId,
  checkoutPathTemplate,
}: BuySessionButtonProps) {
  const router = useRouter();
  const t = useTranslations('Sessions');
  const [pending, setPending] = React.useState(false);

  async function handleBuy() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch('/api/session-grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // ignore — body might be empty
        }
        const code =
          (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
            ? body.code
            : null) ?? 'unknown_error';
        if (code === 'session_price_missing') {
          toast.error(t('priceTbd'));
        } else {
          toast.error(t('buyError'));
        }
        return;
      }
      const body = (await res.json()) as { session_grant_id: string };
      router.push(checkoutPathTemplate.replace('{id}', body.session_grant_id));
    } catch {
      toast.error(t('buyError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="lg" onClick={handleBuy} disabled={pending} aria-busy={pending}>
      {pending ? t('buyPending') : t('buy')}
    </Button>
  );
}
