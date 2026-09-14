'use client';
import * as React from 'react';
import Link from 'next/link';
import { Gift, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type FreeTrialState =
  | { kind: 'eligible' }
  | { kind: 'not_eligible'; status: 'active' | 'completed' | 'pending_payment' }
  | { kind: 'loading' }
  | { kind: 'starting' }
  | { kind: 'success'; checkoutUrl: string }
  | { kind: 'failure'; reason: FreeTrialError };

export type FreeTrialError =
  | 'already_used'
  | 'coupon_unavailable'
  | 'checkout_unavailable'
  | 'session_price_missing'
  | 'session_not_found'
  | 'network'
  | 'generic';

export interface FreeTrialBannerProps {
  initial: FreeTrialState;
  /** The session id to claim (server-resolved). Only used
   *  in the `eligible` / `loading` states. */
  sessionId: string;
  /** The catalog browse href used in the `not_eligible` CTA. */
  catalogHref: string;
  /** Locale-aware copy provider. */
  locale: 'en' | 'fr';
}

/**
 * Dashboard banner for Phase 1 — Feature A: first free
 * 60-minute session. Renders one of five states.
 *
 * - `eligible`     — student has NOT used their free trial. CTA
 *                    starts the claim. On success, the banner
 *                    transitions to `success` and the CTA opens
 *                    the Stripe Checkout URL in the same tab.
 * - `not_eligible` — student has already used their free trial.
 *                    Banner is informational, with a CTA to
 *                    browse the catalog.
 * - `loading` / `starting` — initial server-rendered fetch is
 *                    still resolving / the claim is in flight.
 *                    Spinner only — no destructive action.
 * - `success`      — claim succeeded, banner is in the success
 *                    state and the CTA links to the Stripe
 *                    Checkout URL. The parent route also
 *                    refreshes the page (router.refresh()) so
 *                    the eligibility read returns
 *                    `not_eligible` next time.
 * - `failure`      — claim failed. Banner surfaces the i18n
 *                    error message and a "try again" CTA.
 *
 * The banner is intentionally presentational: all authorization
 * and eligibility enforcement happens server-side. The client
 * cannot influence the student id.
 */
export function FreeTrialBanner({
  initial,
  sessionId,
  catalogHref,
}: FreeTrialBannerProps) {
  const t = useTranslations('FreeTrial');
  const tDashboard = useTranslations('Dashboard.home.freeTrial');
  const [state, setState] = React.useState<FreeTrialState>(initial);
  const [hasNavigated, setHasNavigated] = React.useState(false);

  // Reset local state when the parent re-renders with a new
  // `initial` (e.g. router.refresh() after success).
  React.useEffect(() => {
    setState(initial);
    setHasNavigated(false);
  }, [initial]);

  const claim = React.useCallback(async () => {
    setState({ kind: 'starting' });
    try {
      const res = await fetch('/api/free-trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok: true;
            data: { checkout_url: string; session_grant_id: string };
          }
        | {
            ok: false;
            error: { code: string; message?: string };
          }
        | null;
      if (!res.ok || !payload || payload.ok !== true) {
        const code = (payload && payload.ok === false && payload.error?.code) || 'generic';
        setState({ kind: 'failure', reason: mapErrorCode(code) });
        return;
      }
      const data = payload.data;
      setState({ kind: 'success', checkoutUrl: data.checkout_url });
    } catch {
      setState({ kind: 'failure', reason: 'network' });
    }
  }, [sessionId]);

  // ── Render branches ────────────────────────────────────
  if (state.kind === 'not_eligible') {
    const statusKey = `ineligible.status${capitalize(state.status)}` as
      | 'ineligible.statusActive'
      | 'ineligible.statusCompleted'
      | 'ineligible.statusPending';
    return (
      <Card
        aria-labelledby="free-trial-title"
        data-state="not_eligible"
        className="border-muted bg-muted/30"
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-5 w-5 text-muted-foreground"
              aria-hidden={true}
            />
            <CardTitle id="free-trial-title" className="text-lg sm:text-xl">
              {tDashboard('ineligibleTitle')}
            </CardTitle>
          </div>
          <CardDescription>{tDashboard('ineligibleSubline')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t(statusKey)}</p>
          <Button asChild={true} variant="outline" size="sm">
            <Link href={catalogHref}>{t('ineligible.cta')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'loading' || state.kind === 'starting') {
    return (
      <Card
        aria-busy={true}
        data-state={state.kind}
        className="border-dashed"
      >
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-hidden={true}
          />
          <p className="text-sm text-muted-foreground">
            {state.kind === 'loading' ? t('loading.checking') : t('loading.starting')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'success') {
    return (
      <Card
        aria-labelledby="free-trial-title"
        data-state="success"
        className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift
              className="h-5 w-5 text-green-700 dark:text-green-300"
              aria-hidden={true}
            />
            <CardTitle id="free-trial-title" className="text-lg sm:text-xl">
              {t('success.title')}
            </CardTitle>
          </div>
          <CardDescription>{t('success.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            asChild={true}
            size="sm"
            onClick={() => {
              if (hasNavigated) return;
              setHasNavigated(true);
            }}
          >
            <a href={state.checkoutUrl}>{t('success.cta')}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'failure') {
    return (
      <Card
        aria-labelledby="free-trial-title"
        data-state="failure"
        className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      >
        <CardHeader>
          <CardTitle id="free-trial-title" className="text-lg sm:text-xl">
            {t('failure.title')}
          </CardTitle>
          <CardDescription>
            {t('failure.description')}
            {' '}
            {t(`errors.${state.reason}`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setState({ kind: 'eligible' });
            }}
          >
            {t('failure.cta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // `eligible` — default branch
  return (
    <Card
      aria-labelledby="free-trial-title"
      data-state="eligible"
      className="border-[color:var(--brand-accent)]/40 bg-[color:var(--brand-accent)]/5"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift
            className="h-5 w-5 text-[color:var(--brand-accent)]"
            aria-hidden={true}
          />
          <CardTitle id="free-trial-title" className="text-lg sm:text-xl">
            {tDashboard('eligibleTitle')}
          </CardTitle>
        </div>
        <CardDescription>
          {tDashboard('eligibleSubline')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul className="text-sm text-muted-foreground" aria-label={t('title')}>
          <li>
            <span className="font-medium text-foreground">
              {t('eligible.duration')}
            </span>
            {' · '}
            {t('eligible.notice')}
          </li>
        </ul>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void claim();
          }}
        >
          {t('eligible.cta')}
        </Button>
      </CardContent>
    </Card>
  );
}

function mapErrorCode(code: string): FreeTrialError {
  switch (code) {
    case 'free_trial_already_used':
      return 'already_used';
    case 'coupon_unavailable':
      return 'coupon_unavailable';
    case 'checkout_unavailable':
      return 'checkout_unavailable';
    case 'session_price_missing':
      return 'session_price_missing';
    case 'session_not_found':
      return 'session_not_found';
    default:
      return 'generic';
  }
}

function capitalize(s: string): Capitalize<string> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<string>;
}
