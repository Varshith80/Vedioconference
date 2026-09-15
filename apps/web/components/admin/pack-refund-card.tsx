'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  AdminPackGrant,
  PackRefundPreview,
} from '@/services/admin/pack-grants';
import { formatCents } from '@/lib/utils/format';

// =====================================================================
// Phase 1 — Feature B + TASK 2.1 (financial-consistency repair):
// admin Pack refund card.
//
// Client component for /admin/packs/[id]. Renders the refund
// preview (server-pre-computed on initial render) and exposes
// a "Execute refund" button. The button POSTs to
// /api/admin/pack-grants/[id]/refund.
//
// TASK 2.1 semantics:
//   - On success, the response carries
//     refund_status='n8n_accepted'. The card does NOT claim
//     "Stripe refund confirmed" — Stripe confirmation arrives
//     asynchronously via the Stripe `charge.refunded` webhook +
//     `fn_enrollments_refund` cascade, which flips
//     session_grants.status='refunded' and writes
//     refunded_amount_cents = charge.amount_refunded.
//   - On 502 (webhook_failed) or 503 (webhook_unavailable), the
//     card shows the failure. The pack row is NOT marked
//     refunded (the admin route never flips session_grants).
//   - On 409 already_refunded: race (two admins → 23505 on
//     n8n_executions.run_id) or duplicate (already refunded).
//
// The page can be refreshed to see whether the Stripe
// confirmation has arrived (session_grants.status transitions
// to 'refunded' when `payments.status='refunded'` fires).
// =====================================================================

export interface PackRefundCardProps {
  grantId: string;
  initialPreview: PackRefundPreview;
  status: AdminPackGrant['status'];
  locale: 'en' | 'fr';
  labels: {
    title: string;
    description: string;
    calculate: string;
    execute: string;
    executing: string;
    success: string;
    successPendingStripe: string;
    failure: string;
    webhookFailed: string;
    webhookUnavailable: string;
    alreadyRefunded: string;
    invalidState: string;
    zeroUnused: string;
    unusedSessions: string;
    calculated: string;
    actual: string;
    capped: string;
  };
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; requestedCents: number; refundRequestId: string }
  | {
      kind: 'error';
      reason:
        | 'already_refunded'
        | 'invalid_state'
        | 'zero_unused'
        | 'webhook_failed'
        | 'webhook_unavailable'
        | 'network'
        | 'generic';
    };

export function PackRefundCard({
  grantId,
  initialPreview,
  labels,
  locale,
}: PackRefundCardProps) {
  const [state, setState] = React.useState<SubmitState>({ kind: 'idle' });

  const submit = React.useCallback(async () => {
    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`/api/admin/pack-grants/${grantId}/refund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok: true;
            data: {
              refund_request_id: string;
              requested_amount_cents: number;
              currency: string;
              refund_status: 'n8n_accepted';
            };
          }
        | { ok: false; error: { code: string; message?: string; details?: unknown } }
        | null;
      if (!res.ok || !payload || payload.ok !== true) {
        const code =
          payload && payload.ok === false && payload.error?.code
            ? payload.error.code
            : 'generic';
        if (code === 'pack_refund_already_refunded') {
          setState({ kind: 'error', reason: 'already_refunded' });
          return;
        }
        if (code === 'pack_refund_invalid_state') {
          setState({ kind: 'error', reason: 'invalid_state' });
          return;
        }
        if (code === 'pack_refund_zero') {
          setState({ kind: 'error', reason: 'zero_unused' });
          return;
        }
        if (code === 'pack_refund_webhook_failed') {
          setState({ kind: 'error', reason: 'webhook_failed' });
          return;
        }
        if (code === 'pack_refund_webhook_unavailable') {
          setState({ kind: 'error', reason: 'webhook_unavailable' });
          return;
        }
        setState({ kind: 'error', reason: 'generic' });
        return;
      }
      setState({
        kind: 'success',
        requestedCents: payload.data.requested_amount_cents,
        refundRequestId: payload.data.refund_request_id,
      });
    } catch {
      setState({ kind: 'error', reason: 'network' });
    }
  }, [grantId]);

  const preview = initialPreview;
  const isRefundable = preview.kind === 'ok' && preview.actualCents > 0;
  const isTerminal = preview.kind !== 'ok';

  return (
    <Card data-state={state.kind} aria-busy={state.kind === 'submitting'}>
      <CardHeader>
        <CardTitle className="text-lg sm:text-xl">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preview.kind === 'ok' && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                {labels.unusedSessions}
              </dt>
              <dd className="font-mono text-foreground">
                {preview.unusedSessions}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                {labels.calculated}
              </dt>
              <dd className="font-mono tabular-nums text-foreground">
                {formatCents(preview.calculatedCents, 'EUR', locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                {labels.actual}
              </dt>
              <dd className="font-mono font-medium tabular-nums text-foreground">
                {formatCents(preview.actualCents, 'EUR', locale)}
                {preview.capped && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({labels.capped})
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}

        {preview.kind === 'already_refunded' && (
          <p className="text-sm text-muted-foreground">
            {labels.alreadyRefunded}
          </p>
        )}
        {preview.kind === 'invalid_state' && (
          <p className="text-sm text-muted-foreground">
            {labels.invalidState}
          </p>
        )}

        {state.kind === 'success' && (
          <div
            role="status"
            className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <p className="font-medium">
              {labels.success}: {formatCents(state.requestedCents, 'EUR', locale)}
            </p>
            <p className="mt-1 text-xs">
              {labels.successPendingStripe} ({state.refundRequestId})
            </p>
          </div>
        )}
        {state.kind === 'error' && (
          <div
            role="alert"
            className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          >
            {state.reason === 'already_refunded' && labels.alreadyRefunded}
            {state.reason === 'invalid_state' && labels.invalidState}
            {state.reason === 'zero_unused' && labels.zeroUnused}
            {state.reason === 'webhook_failed' && labels.webhookFailed}
            {state.reason === 'webhook_unavailable' && labels.webhookUnavailable}
            {(state.reason === 'network' || state.reason === 'generic') &&
              labels.failure}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            size="sm"
            disabled={
              !isRefundable || isTerminal || state.kind === 'submitting' || state.kind === 'success'
            }
            onClick={() => {
              void submit();
            }}
          >
            {state.kind === 'submitting' ? labels.executing : labels.execute}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
